/**
 * Character ↔ block attachment — the STORY ledger of a block instance
 * ([[story-attachment-two-ledgers-2026-08-19]]). The ForgeItem is the
 * campaign-agnostic archetype (mechanics ledger); CharacterBlockLink.story
 * holds the bearer's specifics. Also gathers the seed's proper nouns for the
 * archetype check at the propose_forge_blueprint boundary (block-archetype.ts).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { ARCHETYPE_REJECTED_PREFIX, buildBannedTerms, type BannedTerms } from './block-archetype';

export const ATTACHMENT_STORY_MAX = 600;

/** The latest genesis work session for a character (goal carries `[characterId]`). */
export async function findGenesisSession(campaignId: string, characterId: string) {
  return prisma.dayaWorkSession.findFirst({
    where: { campaignId, goal: { contains: `[${characterId}]` }, status: { not: 'cancelled' } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, plan: true, progress: true, status: true },
  });
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out));
  return out;
}

/**
 * Everything campaign-specific a block must not carry: the bearer's name, the
 * seed's proper nouns (backstory, physical description, genesis brief) and
 * the campaign's own names (campaign, locations, characters).
 */
export async function loadArchetypeBans(campaignId: string, characterId?: string | null): Promise<BannedTerms> {
  const [campaign, locations, characters] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } }),
    prisma.location.findMany({ where: { campaignId }, select: { name: true } }),
    prisma.character.findMany({ where: { campaignId }, select: { name: true } }),
  ]);
  const dbNames = [
    ...(campaign?.name ? [campaign.name] : []),
    ...locations.map(l => l.name),
    ...characters.map(c => c.name),
  ];
  if (!characterId) {
    // No bearer named (e.g. an item for a room): every seed still in genesis
    // here is campaign-specific all the same.
    const live = await prisma.dayaWorkSession.findMany({
      where: { campaignId, status: { in: ['active', 'blocked'] }, goal: { startsWith: 'Character genesis' } },
      select: { plan: true },
    });
    return buildBannedTerms({ seedText: live.map(s => s.plan ?? '').join('\n'), dbNames });
  }

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { name: true, data: true, campaignId: true },
  });
  if (!character || character.campaignId !== campaignId) throw new NotFoundError('Character not found in this campaign');
  const seed: string[] = [];
  try {
    const data = JSON.parse(character.data) as { backstory?: { backstory?: string }; identity?: { physicalDescription?: unknown } };
    if (data.backstory?.backstory) seed.push(data.backstory.backstory);
    seed.push(...strings(data.identity?.physicalDescription));
  } catch { /* unreadable sheet → the genesis brief still carries the seed */ }
  const session = await findGenesisSession(campaignId, characterId);
  if (session?.plan) seed.push(session.plan);
  return buildBannedTerms({ seedText: seed.join('\n'), bearerName: character.name, dbNames });
}

/** Attach (or re-story) a block to a character. Idempotent per (character, block). */
export async function attachBlockToCharacter(opts: {
  campaignId: string;
  characterId: string;
  forgeItemId: string;
  story: string;
  localName?: string | null;
  sessionId?: string | null;
  /** Origin line for the instance history (first attach only). */
  origin?: string;
}) {
  const story = opts.story.trim();
  const localName = opts.localName?.trim() || null;
  if (localName && localName.length > LOCAL_NAME_MAX) {
    throw new ValidationError(`localName is ${localName.length} chars — keep it ≤${LOCAL_NAME_MAX}`);
  }
  if (!story) throw new ValidationError('attachmentStory is required — the bearer\'s specifics for this block');
  if (story.length > ATTACHMENT_STORY_MAX) {
    throw new ValidationError(`attachmentStory is ${story.length} chars — keep it ≤${ATTACHMENT_STORY_MAX}`);
  }
  const [character, item] = await Promise.all([
    prisma.character.findUnique({ where: { id: opts.characterId }, select: { campaignId: true } }),
    prisma.forgeItem.findUnique({ where: { id: opts.forgeItemId }, select: { campaignId: true, status: true } }),
  ]);
  if (!character || character.campaignId !== opts.campaignId) throw new NotFoundError('Character not found in this campaign');
  if (!item || item.campaignId !== opts.campaignId) throw new NotFoundError('Block not found in this campaign');
  if (item.status === 'superseded') throw new ValidationError('That block was withdrawn — attach a live one');
  return prisma.characterBlockLink.upsert({
    where: { characterId_forgeItemId: { characterId: opts.characterId, forgeItemId: opts.forgeItemId } },
    create: {
      campaignId: opts.campaignId,
      characterId: opts.characterId,
      forgeItemId: opts.forgeItemId,
      localName,
      story,
      history: JSON.stringify([historyEntry('origin', opts.origin ?? 'attached')]),
      sessionId: opts.sessionId ?? null,
    },
    update: {
      story,
      ...(localName ? { localName } : {}),
      ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
    },
  });
}

export const LOCAL_NAME_MAX = 100;

/** One entry of an instance's history ledger (object/instance history, not memory). */
export function historyEntry(kind: string, text: string) {
  return { kind, at: new Date().toISOString(), text };
}

export { ARCHETYPE_REJECTED_PREFIX };

/**
 * Record a validator rejection on the character's genesis session so later
 * drafting cycles list it ("do not repeat these shapes"). Best-effort.
 */
export async function recordArchetypeRejection(opts: {
  campaignId: string;
  characterId: string;
  type: string;
  name: string;
  tokens: string[];
}): Promise<void> {
  try {
    const session = await findGenesisSession(opts.campaignId, opts.characterId);
    if (!session) return;
    let notes: string[] = [];
    try { notes = JSON.parse(session.progress) as string[]; } catch { notes = []; }
    notes.push(`${ARCHETYPE_REJECTED_PREFIX} ${opts.type} "${opts.name}" — generalise ${opts.tokens.join(', ')}`);
    await prisma.dayaWorkSession.update({
      where: { id: session.id },
      data: { progress: JSON.stringify(notes.slice(-200)) },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[block-attachment] rejection not recorded:', err);
  }
}
