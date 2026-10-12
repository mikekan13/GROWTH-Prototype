/**
 * BORN ≠ DONE (Mike 2026-10-12, after Violet's birth): "He completed Violet but
 * the character would still not be done. The image creation would halt this
 * as being done and wait for the user if they hadn't finished at this point."
 *
 * A character's COMPLETION is derived, never stored:
 *
 *   genesis  'born'    — its latest genesis DayaWorkSession closed 'done'
 *                        (or it was written whole by the SKETCH tier)
 *            'pending'  — otherwise (in flight, hand-built, never submitted)
 *   image    'done'    — an OFFICIAL portrait exists: Character.portrait (set
 *                        by acceptPortrait — and lockPersona, which the
 *                        identity-lock wizard calls after the official bust +
 *                        body) or data.identity.generatedBust (the wizard's
 *                        official bust, persisted on completion)
 *            'locked'  — a PersonaLock exists but no official portrait yet
 *            'pending' — no image work finished
 *   done     = genesis 'born' AND image 'done'
 *
 * A completeness flag, NOT a gate: an "awaiting image" character is ACTIVE
 * and voiceable. Surfaces: the genesis overlay ("BORN · awaiting image" + a
 * Portrait step), the canvas card + Tapestry badge, the Watcher's Needs-you.
 */
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';

/** Same goal shape as character-genesis-progress#parseGenesisGoal (kept local:
 *  that module imports this one — no import cycle). */
function genesisGoalCharacterId(goal: string): string | null {
  const m = /^Character genesis: (.+?) \[([^\]\s]+)\]/.exec(goal);
  return m ? m[2] : null;
}

export type GenesisCompletion = 'pending' | 'born';
export type ImageCompletion = 'pending' | 'locked' | 'done';

export interface CharacterCompletion {
  genesis: GenesisCompletion;
  image: ImageCompletion;
  done: boolean;
}

export interface CompletionFacts {
  genesisBorn: boolean;
  /** Character.portrait — the accepted current portrait path. */
  portrait: string | null;
  /** Character.data (JSON string or parsed) — carries identity.generatedBust. */
  data: string | Record<string, unknown> | null;
  personaLocked: boolean;
}

/** The identity-lock wizard's official bust path, if persisted on the sheet. */
export function officialBustPath(data: CompletionFacts['data']): string | null {
  let d: unknown = data;
  if (typeof data === 'string') {
    try { d = JSON.parse(data); } catch { return null; }
  }
  const bust = (d as { identity?: { generatedBust?: unknown } } | null)?.identity?.generatedBust;
  return typeof bust === 'string' && bust.trim() ? bust : null;
}

export function deriveImageCompletion(f: Pick<CompletionFacts, 'portrait' | 'data' | 'personaLocked'>): ImageCompletion {
  if ((f.portrait && f.portrait.trim()) || officialBustPath(f.data)) return 'done';
  return f.personaLocked ? 'locked' : 'pending';
}

export function deriveCharacterCompletion(f: CompletionFacts): CharacterCompletion {
  const genesis: GenesisCompletion = f.genesisBorn ? 'born' : 'pending';
  const image = deriveImageCompletion(f);
  return { genesis, image, done: genesis === 'born' && image === 'done' };
}

/** Born, but the portrait step is unfinished — the badge + Needs-you case. */
export function isAwaitingImage(c: CharacterCompletion | null | undefined): boolean {
  return !!c && c.genesis === 'born' && c.image !== 'done';
}

/** The latest genesis session per character decides 'born' (sessions newest first). */
export function bornCharacterIds(sessions: Array<{ goal: string; status: string }>): Set<string> {
  const seen = new Set<string>();
  const born = new Set<string>();
  for (const s of sessions) {
    const id = genesisGoalCharacterId(s.goal);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (s.status === 'done') born.add(id);
  }
  return born;
}

const CHARACTER_SELECT = {
  id: true, name: true, portrait: true, data: true, genesisTier: true,
  personaLock: { select: { id: true } },
} as const;

type CharacterRow = {
  id: string; name: string; portrait: string | null; data: string; genesisTier: string | null;
  personaLock: { id: string } | null;
};

function fromRow(row: CharacterRow, genesisBorn: boolean): CharacterCompletion {
  return deriveCharacterCompletion({
    genesisBorn: genesisBorn || row.genesisTier === 'SKETCH',
    portrait: row.portrait,
    data: row.data,
    personaLocked: !!row.personaLock,
  });
}

/** One character's completion (campaign genesis sessions decide 'born'). */
export async function getCharacterCompletion(characterId: string): Promise<CharacterCompletion> {
  const row = await prisma.character.findUnique({
    where: { id: characterId }, select: { ...CHARACTER_SELECT, campaignId: true },
  }) as (CharacterRow & { campaignId: string | null }) | null;
  if (!row) throw new NotFoundError('Character not found');
  let born = false;
  if (row.campaignId) {
    const sessions = await prisma.dayaWorkSession.findMany({
      where: { campaignId: row.campaignId, goal: { contains: `[${characterId}]` } },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { goal: true, status: true },
    });
    born = bornCharacterIds(sessions).has(characterId);
  }
  return fromRow(row, born);
}

export interface CampaignCompletionRow extends CharacterCompletion { id: string; name: string }

/** Every character's completion in a campaign, keyed by id. Caller owns access checks. */
export async function getCampaignCompletions(campaignId: string): Promise<Map<string, CampaignCompletionRow>> {
  const [chars, sessions] = await Promise.all([
    prisma.character.findMany({ where: { campaignId }, select: CHARACTER_SELECT }) as Promise<CharacterRow[]>,
    prisma.dayaWorkSession.findMany({
      where: { campaignId, goal: { startsWith: 'Character genesis' } },
      orderBy: { startedAt: 'desc' },
      select: { goal: true, status: true },
    }),
  ]);
  const born = bornCharacterIds(sessions);
  const out = new Map<string, CampaignCompletionRow>();
  for (const c of chars) out.set(c.id, { id: c.id, name: c.name, ...fromRow(c, born.has(c.id)) });
  return out;
}
