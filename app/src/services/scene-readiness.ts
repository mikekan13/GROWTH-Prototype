/**
 * Play happens above the line (Mike 2026-10-17: "we have all this as below the
 * line so that shouldn't happen… We are in fluid where nothing is able to be
 * played"). Hello world ran in an apartment, its rooms and a landing that were
 * all still PLANNING.
 *
 * Before a session starts, the scene is read: the places the awake beings
 * stand in (and every place above them), the characters at the table. What
 * is still fluid is listed; the Watcher either crystallizes it first or does
 * not play there.
 *
 *   places      Location.status PLANNING  → ACTIVE (with its rooms, cascade)
 *   characters  Character.status DRAFT    → reported; crystallized on the
 *               canvas (services/entity crystallizeEntity, costs KRMA)
 *   items       have no fluid status of their own today (a ledger only);
 *               counted, never blocking  [QUESTION for Mike]
 *
 * Location crystallization is unmetered today (services/location.ts TODO);
 * that stays as it is here.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ConflictError } from '@/lib/errors';
import { updateLocationStatus } from '@/services/location';

const REL = 'located_at';
const MAX_DEPTH = 8;

export interface FluidPlace { id: string; name: string; status: string }
export interface FluidCharacter { id: string; name: string; status: string }

export interface SceneReadiness {
  ready: boolean;
  /** Places in the scene still PLANNING (deepest first, then their parents). */
  places: FluidPlace[];
  /** Characters at the table (awake beings and the party) still DRAFT. */
  characters: FluidCharacter[];
  /** Items in the scene's rooms or in the table's hands: a count, not a gate. */
  itemsInScene: number;
  /** Who the scene was read from. */
  seats: Array<{ id: string; name: string; locationId: string | null }>;
}

export class SceneNotReadyError extends ConflictError {
  constructor(public readonly readiness: SceneReadiness) {
    super(describeReadiness(readiness));
    this.name = 'SceneNotReadyError';
  }
}

/** One plain sentence for the Watcher. Pure. */
export function describeReadiness(r: SceneReadiness): string {
  const parts: string[] = [];
  if (r.places.length) parts.push(`${r.places.length === 1 ? 'a place is' : `${r.places.length} places are`} still below the line: ${r.places.map((p) => p.name).join(', ')}`);
  if (r.characters.length) parts.push(`${r.characters.length === 1 ? 'a character is' : `${r.characters.length} characters are`} still a draft: ${r.characters.map((c) => c.name).join(', ')}`);
  return parts.length ? `The scene is not crystallized — ${parts.join('; ')}.` : 'The scene is crystallized.';
}

/** The chain of places above a location (the location itself first). */
async function placeChainUp(locationId: string): Promise<Array<{ id: string; name: string; status: string }>> {
  const out: Array<{ id: string; name: string; status: string }> = [];
  let cur: string | null = locationId;
  const seen = new Set<string>();
  for (let i = 0; cur && i < MAX_DEPTH && !seen.has(cur); i++) {
    seen.add(cur);
    const loc: { id: string; name: string; status: string } | null = await prisma.location.findUnique({ where: { id: cur }, select: { id: true, name: true, status: true } });
    if (!loc) break;
    out.push(loc);
    const rel: { targetId: string } | null = await prisma.entityRelationship.findFirst({ where: { sourceId: cur, relationshipType: REL, targetType: 'LOCATION' }, select: { targetId: true } });
    cur = rel?.targetId ?? null;
  }
  return out;
}

/**
 * Who is seated at the table: every character with a being (awake or voiced
 * by the Watcher — HW2 2026-10-24: Kristopher's landing was missed because
 * his dormant being did not count), plus the player characters (the party is
 * at the table whether or not the AI plays them).
 */
async function seatsOf(campaignId: string): Promise<Array<{ id: string; name: string; status: string; locationId: string | null }>> {
  const chars = await prisma.character.findMany({
    where: { campaignId, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } },
    select: { id: true, name: true, status: true, entityType: true },
  });
  const wrapped = new Set((await prisma.dayaEntity.findMany({ where: { characterId: { in: chars.map((c) => c.id) }, status: { in: ['ACTIVE', 'DORMANT'] } }, select: { characterId: true } })).map((e) => e.characterId));
  const seated = chars.filter((c) => wrapped.has(c.id) || c.entityType === 'PLAYER_CHARACTER');
  const rels = await prisma.entityRelationship.findMany({ where: { sourceId: { in: seated.map((c) => c.id) }, relationshipType: REL }, select: { sourceId: true, targetId: true } });
  const where = new Map(rels.map((r) => [r.sourceId, r.targetId]));
  return seated.map((c) => ({ id: c.id, name: c.name, status: c.status, locationId: where.get(c.id) ?? null }));
}

export async function sceneReadiness(campaignId: string): Promise<SceneReadiness> {
  const seats = await seatsOf(campaignId);
  const placeIds = new Set<string>();
  const places = new Map<string, FluidPlace>();
  const roomIds = new Set<string>();
  for (const s of seats) {
    if (!s.locationId) continue;
    roomIds.add(s.locationId);
    for (const p of await placeChainUp(s.locationId)) {
      if (placeIds.has(p.id)) continue;
      placeIds.add(p.id);
      if (p.status === 'PLANNING') places.set(p.id, { id: p.id, name: p.name, status: p.status });
    }
  }
  const characters = seats.filter((s) => s.status === 'DRAFT').map((s) => ({ id: s.id, name: s.name, status: s.status }));
  const itemsInScene = await prisma.campaignItem.count({
    where: { campaignId, status: 'ACTIVE', OR: [{ locationId: { in: [...roomIds] } }, { holderId: { in: seats.map((s) => s.id) } }] },
  });
  const list = [...places.values()];
  return {
    ready: list.length === 0 && characters.length === 0,
    places: list,
    characters,
    itemsInScene,
    seats: seats.map((s) => ({ id: s.id, name: s.name, locationId: s.locationId })),
  };
}

/** Refuse unless the scene is ready. */
export async function assertSceneReady(campaignId: string): Promise<SceneReadiness> {
  const r = await sceneReadiness(campaignId);
  if (!r.ready) throw new SceneNotReadyError(r);
  return r;
}

/**
 * Crystallize the scene's fluid PLACES (ACTIVE, each with its rooms). Draft
 * characters are not crystallized here — that is the canvas's gesture and it
 * costs KRMA (services/entity). Returns what was flipped.
 */
export async function crystallizeScenePlaces(
  campaignId: string,
  actor: { userId: string; role: string },
): Promise<{ crystallized: FluidPlace[]; readiness: SceneReadiness }> {
  const before = await sceneReadiness(campaignId);
  // Roots first: cascading from a parent flips its rooms too, so the rooms need no second call.
  const ids = new Set(before.places.map((p) => p.id));
  const crystallized: FluidPlace[] = [];
  for (const p of before.places) {
    if (!ids.has(p.id)) continue;
    const chain = await placeChainUp(p.id);
    const root = [...chain].reverse().find((c) => ids.has(c.id)) ?? p;
    await updateLocationStatus(root.id, actor.userId, actor.role, { status: 'ACTIVE', cascade: true });
    for (const c of chain) ids.delete(c.id);
    crystallized.push({ id: root.id, name: root.name, status: 'ACTIVE' });
  }
  return { crystallized, readiness: await sceneReadiness(campaignId) };
}
