/**
 * NOVEL WORLDS (Mike 2026-10-16,
 * [[ruling-novels-are-worlds-canvas-is-the-map-consistency-2026-10-16]] §5):
 * a novel she has published is a WORLD — its own Campaign in the Watcher's
 * list at session 0 — and the book on her shelf is the DOORWAY to it.
 *
 * "I need say over those stories" — nothing here writes a plot, a person or
 * a place. The campaign is created EMPTY (session 0); the story is authored
 * with the Watcher later, the way any campaign is built.
 *
 * The novel itself is narrative paint over the campaign-agnostic "Published
 * Novel" archetype ([[ruling-narrative-paint-global-archetype-local-instance-2026-10-12]]),
 * granted through the possessions stage (catalog first → pull from stock,
 * the `owns` deed, the located_at edge into the shelf).
 *
 * The link, both ways (no schema change):
 *   item.data.linkedCampaignId = <world campaign id>, item.data.doorway = true
 *   campaign.aiSettings.sourceNovel = { characterId, itemId, title }
 *     (Campaign has no general JSON field; aiSettings is the JSON column and
 *     services/ai/campaign-ai spreads it over defaults, so the extra key is inert.)
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { createCampaign } from './campaign';
import { grantPossession, DEED_RELATIONSHIP } from './genesis-possessions';
import { getUserTrainingConsent } from './consent';

export const NOVEL_ARCHETYPE = 'Published Novel';

export const createNovelWorldSchema = z.object({
  authorCharacterId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(100),
  shelfLocation: z.string().trim().min(1).max(200).optional(),
});
export type CreateNovelWorldInput = z.infer<typeof createNovelWorldSchema>;

export interface SourceNovel { characterId: string; itemId: string; title: string }
export interface NovelWorld { title: string; itemId: string; campaignId: string }
export interface CreateNovelWorldResult extends NovelWorld { created: boolean; inside?: string }

type Actor = { id: string; role: string };

function parseJson(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch { return {}; }
}

/** The world campaign's description. Pure — no plot, ever. */
export function worldDescription(authorName: string, title: string): string {
  return `A world of ${authorName}'s novel «${title}». Session 0 — nothing is written yet; the story is the Watcher's.`;
}

/** The novel instance's story line. Pure — says what it is, never what happens in it. */
export function novelStory(authorName: string, title: string): string {
  return `${authorName}'s published novel «${title}» — her own book, on her shelf. Its story is a world of its own (the doorway); what happens in it is the Watcher's to tell.`;
}

/**
 * Create (or find) the world campaign for one of her novels and the novel on
 * her shelf that opens onto it. Idempotent by (authorCharacterId, title).
 */
export async function createNovelWorld(actor: Actor, input: unknown): Promise<CreateNovelWorldResult> {
  const p = createNovelWorldSchema.parse(input);
  const author = await prisma.character.findUnique({
    where: { id: p.authorCharacterId },
    select: { id: true, name: true, campaignId: true, campaign: { select: { id: true, gmUserId: true, networkMode: true } } },
  });
  if (!author || !author.campaign) throw new NotFoundError('Author character not found');
  const home = author.campaign;
  if (!canManageCampaign(actor.id, actor.role, home)) {
    throw new ForbiddenError("Only the author's Watcher (or ADMIN) can open a novel's world");
  }

  // 1. The novel — pulled + painted + deeded + placed (idempotent by name).
  const grant = await grantPossession(home.id, actor, {
    characterId: author.id,
    item: NOVEL_ARCHETYPE,
    tier: 'owned',
    localName: p.title,
    story: novelStory(author.name, p.title),
    ...(p.shelfLocation ? { location: p.shelfLocation } : {}),
    allowDuplicate: true, // three novels, one archetype
  });
  if (!grant.ok) throw new ValidationError(`Could not place the novel «${p.title}»: ${grant.reason}`);

  const item = await prisma.campaignItem.findUnique({ where: { id: grant.itemId }, select: { id: true, data: true } });
  if (!item) throw new NotFoundError('Novel item vanished after grant');
  const itemData = parseJson(item.data);

  // 2. The world — reuse the one this doorway already opens onto, else create it.
  let campaignId: string | null = null;
  const linked = typeof itemData.linkedCampaignId === 'string' ? itemData.linkedCampaignId : null;
  if (linked && await prisma.campaign.findUnique({ where: { id: linked }, select: { id: true } })) campaignId = linked;
  if (!campaignId) campaignId = (await findWorldBySource(home.gmUserId, author.id, p.title))?.id ?? null;

  let created = false;
  if (!campaignId) {
    // The world is the Watcher's: owned by the author's GM, same network mode.
    const ownerRole = home.gmUserId === actor.id
      ? actor.role
      : (await prisma.user.findUnique({ where: { id: home.gmUserId }, select: { role: true } }))?.role ?? '';
    // Consent is never assumed: the world joins the META only when its home
    // does AND the Watcher has consent on record; otherwise DISCONNECTED.
    const meta = home.networkMode === 'META' && await getUserTrainingConsent(home.gmUserId);
    const campaign = await createCampaign(home.gmUserId, ownerRole, {
      name: p.title,
      description: worldDescription(author.name, p.title),
      networkMode: meta ? 'META' : 'DISCONNECTED',
    });
    campaignId = campaign.id;
    created = true;
  }

  // 3. Link both ways.
  const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { aiSettings: true } });
  const sourceNovel: SourceNovel = { characterId: author.id, itemId: item.id, title: p.title };
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { aiSettings: JSON.stringify({ ...parseJson(camp?.aiSettings), sourceNovel }) },
  });
  if (itemData.linkedCampaignId !== campaignId || itemData.doorway !== true) {
    await prisma.campaignItem.update({
      where: { id: item.id },
      data: { data: JSON.stringify({ ...itemData, linkedCampaignId: campaignId, doorway: true }) },
    });
  }

  return { title: p.title, itemId: item.id, campaignId, created, ...(grant.inside ? { inside: grant.inside } : {}) };
}

/** A world campaign of this Watcher whose sourceNovel is (character, title). */
async function findWorldBySource(gmUserId: string, characterId: string, title: string) {
  const rows = await prisma.campaign.findMany({
    where: { gmUserId, aiSettings: { contains: '"sourceNovel"' } },
    select: { id: true, aiSettings: true },
  });
  return rows.find(r => {
    const s = parseJson(r.aiSettings).sourceNovel as Partial<SourceNovel> | undefined;
    return s?.characterId === characterId && s?.title === title;
  }) ?? null;
}

/** Her novels that are doorways: the items she holds the deed to with data.doorway. */
export async function listNovelWorlds(characterId: string): Promise<NovelWorld[]> {
  const deeds = await prisma.entityRelationship.findMany({
    where: { sourceId: characterId, relationshipType: DEED_RELATIONSHIP, targetType: 'CAMPAIGN_ITEM' },
    select: { targetId: true },
  });
  if (deeds.length === 0) return [];
  const items = await prisma.campaignItem.findMany({
    where: { id: { in: deeds.map(d => d.targetId) }, status: 'ACTIVE' },
    select: { id: true, name: true, data: true },
    orderBy: { createdAt: 'asc' },
  });
  const out: NovelWorld[] = [];
  for (const it of items) {
    const d = parseJson(it.data);
    if (d.doorway === true && typeof d.linkedCampaignId === 'string') out.push({ title: it.name, itemId: it.id, campaignId: d.linkedCampaignId });
  }
  return out;
}

/** Route guard for the GET: her Watcher, ADMIN, or her player. */
export async function listNovelWorldsFor(actor: Actor, characterId: string): Promise<NovelWorld[]> {
  const ch = await prisma.character.findUnique({ where: { id: characterId }, select: { userId: true, campaign: { select: { gmUserId: true } } } });
  if (!ch) throw new NotFoundError('Character not found');
  const mayView = ch.userId === actor.id || (ch.campaign ? canManageCampaign(actor.id, actor.role, ch.campaign) : false);
  if (!mayView) throw new ForbiddenError('Not your character');
  return listNovelWorlds(characterId);
}

/** One line for JEWL's WORLD brief, or null when she has no novel worlds. */
export async function novelWorldsBriefLine(characterId: string): Promise<string | null> {
  const worlds = await listNovelWorlds(characterId);
  if (worlds.length === 0) return null;
  return 'HER NOVELS ARE WORLDS (each book on her shelf is a doorway to its own campaign; the stories are the Watcher\'s — ask, never invent): ' +
    worlds.map(w => `«${w.title}» → campaign ${w.campaignId} (session 0)`).join('; ');
}
