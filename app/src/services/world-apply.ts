/**
 * The engine keeps the map true, not the GM (Mike 2026-10-17: "the map should
 * just be updated by the engine... that is the point").
 *
 * Two halves, both used by the adjudicator (daya/adjudicator.ts):
 *
 *   1. MAP → ACT. What the map says about the actor's room goes into the
 *      adjudication as facts (`[map] door "Entry door" … LOCKED`), and an act
 *      the map plainly forbids — opening a locked door with no unlocking —
 *      is resolved against it before any model is asked.
 *
 *   2. ACT → MAP. A resolved act names its physical effects (door state, a
 *      thing taken / handed over / put down, a step into another room); this
 *      module applies each one to the map's own tables — the home's
 *      openings, CampaignItem.holderId / located_at, the character's
 *      located_at — and tells every open canvas to re-read.
 *
 * Rules the map enforces here, whatever the model said:
 *   - a LOCKED door never goes straight to OPEN; it is unlocked (→ closed) first;
 *   - only a door opens, closes or locks;
 *   - a thing is taken only from the actor's own room, given only from the
 *     actor's own hands, to someone in the same room.
 * Refused effects are reported, never thrown: the act still happened in the
 * story as the adjudicator told it; the map just did not move for that part.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { parseOpenings, type DoorState } from '@/lib/canvas-geometry';
import { placeItem } from '@/services/placement';
import { moveCharacterToLocation } from '@/services/character-location';
import { broadcastEvent } from '@/lib/campaign-stream';

export type ActEffect =
  | { op: 'door'; door: string; state: DoorState }
  | { op: 'take'; item: string }
  | { op: 'give'; item: string; to: string }
  | { op: 'put'; item: string; into: string }
  | { op: 'move'; to: string };

export interface MapDoor {
  id: string;
  name: string;
  between: string[];
  state: DoorState;
  /** The location whose data carries this opening. */
  homeId: string;
}

export interface ActorMap {
  roomId: string;
  roomName: string;
  home: { id: string; name: string };
  doors: MapDoor[];
}

const REL = 'located_at';
const MAX_DEPTH = 8;

function parseData(raw: string | null): Record<string, unknown> {
  try { const d = raw ? JSON.parse(raw) : {}; return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}

async function parentLocationId(locationId: string): Promise<string | null> {
  const e = await prisma.entityRelationship.findFirst({ where: { sourceId: locationId, relationshipType: REL, targetType: 'LOCATION' }, select: { targetId: true } });
  return e?.targetId ?? null;
}

/**
 * The map around a character: the room they stand in, the home whose
 * openings include that room, and every door that touches the room (a
 * room's own openings when the home is the room itself).
 */
export async function actorMap(characterId: string): Promise<ActorMap | null> {
  const rel = await prisma.entityRelationship.findFirst({ where: { sourceId: characterId, relationshipType: REL }, select: { targetId: true } });
  if (!rel) return null;
  const room = await prisma.location.findUnique({ where: { id: rel.targetId }, select: { id: true, name: true, data: true } });
  if (!room) return null;
  // Walk up to the first location that carries openings; the room itself counts.
  let cur: { id: string; name: string; data: string | null } | null = room;
  const chain: Array<{ id: string; name: string; data: string | null }> = [];
  for (let i = 0; cur && i < MAX_DEPTH; i++) {
    chain.push(cur);
    const pid: string | null = await parentLocationId(cur.id);
    cur = pid ? await prisma.location.findUnique({ where: { id: pid }, select: { id: true, name: true, data: true } }) : null;
  }
  const names = new Set(chain.map((c) => c.name.toLowerCase()));
  const doors: MapDoor[] = [];
  let home = { id: room.id, name: room.name };
  for (const loc of chain) {
    const openings = parseOpenings(parseData(loc.data).openings);
    if (!openings.length) continue;
    home = { id: loc.id, name: loc.name };
    for (const o of openings) {
      if (o.kind !== 'door') continue;
      // A door of the home that touches the actor's room (or the home itself when it is the room).
      const touches = loc.id === room.id || o.between.some((b) => b.toLowerCase() === room.name.toLowerCase()) || o.between.some((b) => names.has(b.toLowerCase()));
      if (!touches) continue;
      doors.push({ id: o.id, name: o.name ?? `door between ${o.between.join(' and ')}`, between: o.between, state: o.state ?? 'closed', homeId: loc.id });
    }
    break;
  }
  return { roomId: room.id, roomName: room.name, home, doors };
}

// ── Who is where (HW4 2026-10-24) ─────────────────────────────────────────────
// The adjudicator let Violet hold a bill out "in the space between you" with a
// locked door and two rooms between her and the man. It knew the doors of her
// room; it did not know where he stood. Every other character is placed
// relative to the actor: in this room, or beyond the openings on the way.

export interface PassageEdge {
  name: string;
  kind: 'door' | 'archway' | 'opening';
  state?: DoorState;
  between: string[];
}

/** Rooms joined by passages (doors, archways, openings — not windows). Pure. */
export function passageGraph(openings: Array<{ name?: string; kind: string; state?: DoorState; between: string[] }>): PassageEdge[] {
  const out: PassageEdge[] = [];
  for (const o of openings) {
    if (o.kind !== 'door' && o.kind !== 'archway' && o.kind !== 'opening') continue;
    if (!Array.isArray(o.between) || o.between.length < 2) continue;
    out.push({ name: o.name ?? `${o.kind} between ${o.between.join(' and ')}`, kind: o.kind, state: o.state, between: o.between.map((b) => b.trim()) });
  }
  return out;
}

/** The passages on the shortest way from one room to another, by room name; null when none joins them. Pure. */
export function routeBetween(graph: PassageEdge[], fromRoom: string, toRoom: string): PassageEdge[] | null {
  const from = fromRoom.trim().toLowerCase();
  const to = toRoom.trim().toLowerCase();
  if (from === to) return [];
  const prev = new Map<string, { room: string; edge: PassageEdge } | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const room = queue.shift()!;
    if (room === to) break;
    for (const e of graph) {
      const sides = e.between.map((b) => b.toLowerCase());
      if (!sides.includes(room)) continue;
      for (const next of sides) {
        if (next === room || prev.has(next)) continue;
        prev.set(next, { room, edge: e });
        queue.push(next);
      }
    }
  }
  if (!prev.has(to)) return null;
  const path: PassageEdge[] = [];
  for (let cur = to; cur !== from;) { const p = prev.get(cur)!; path.unshift(p.edge); cur = p.room; }
  return path;
}

/** "Entry door (locked)" / "Kitchenette opening (open archway)". Pure. */
export function passageInWords(e: PassageEdge): string {
  return e.kind === 'door' ? `${e.name} (${e.state ?? 'closed'})` : `${e.name} (open ${e.kind})`;
}

export interface Whereabouts {
  id: string;
  name: string;
  roomName: string | null;
  /** [] = in the actor's room; null = no way through on the map (or unplaced). */
  route: PassageEdge[] | null;
}

/** Every other character placed relative to the actor's room. Never throws (→ []). */
export async function whereOthersStand(campaignId: string, actorCharacterId: string, map: ActorMap | null): Promise<Whereabouts[]> {
  try {
    const [others, locs] = await Promise.all([
      prisma.character.findMany({ where: { campaignId, id: { not: actorCharacterId }, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } }, select: { id: true, name: true } }),
      prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } }),
    ]);
    if (!others.length) return [];
    const rels = await prisma.entityRelationship.findMany({ where: { sourceId: { in: others.map((o) => o.id) }, relationshipType: REL }, select: { sourceId: true, targetId: true } });
    const roomOf = new Map(rels.map((r) => [r.sourceId, locs.find((l) => l.id === r.targetId)?.name ?? null]));
    const graph = passageGraph(locs.flatMap((l) => parseOpenings(parseData(l.data).openings)));
    return others.map((o) => {
      const roomName = roomOf.get(o.id) ?? null;
      const route = map && roomName ? routeBetween(graph, map.roomName, roomName) : null;
      return { id: o.id, name: o.name, roomName, route };
    });
  } catch (err) {
    console.warn('[world-apply] whereabouts unreadable (non-fatal):', err instanceof Error ? err.message : err);
    return [];
  }
}

/** The whereabouts as lines the adjudicator can treat as facts. Pure. */
export function whereaboutsLines(actorRoom: string | null, rows: Whereabouts[]): string[] {
  return rows.map((w) => {
    if (!w.roomName) return `${w.name}: nowhere on the map — not here.`;
    if (w.route && w.route.length === 0) return `${w.name}: HERE, in ${w.roomName} with the actor.`;
    if (w.route) {
      const sealed = w.route.some((e) => e.kind === 'door' && e.state !== 'open');
      return `${w.name}: in ${w.roomName}, beyond ${w.route.map(passageInWords).join(' then ')}${sealed ? ' — out of sight and out of reach from here' : ' — within reach through the open way'}.`;
    }
    return `${w.name}: in ${w.roomName}, no way through from ${actorRoom ?? 'here'} on the map — out of reach.`;
  });
}

/** The map as lines the adjudicator can treat as facts. Pure. */
export function mapFactLines(map: ActorMap | null): string[] {
  if (!map) return [];
  const lines = [`[map] standing in: ${map.roomName}${map.home.id !== map.roomId ? ` (part of ${map.home.name})` : ''}`];
  for (const d of map.doors) lines.push(`[map] door "${d.name}" between ${d.between.join(' and ')}: ${d.state.toUpperCase()}`);
  if (!map.doors.length) lines.push('[map] no door touches this room');
  return lines;
}

const OPENS_RE = /\b(open|opens|opening|push(?:es)?|pull(?:s)?|yank(?:s)?|swing(?:s)?|throw(?:s)?|step(?:s)?\s+(?:out|through|into)|go(?:es)?\s+(?:out|through)|walk(?:s)?\s+(?:out|through)|head(?:s)?\s+out|leave(?:s)?|exit(?:s)?)\b/i;
const DOOR_RE = /\bdoors?\b/i;
const UNLOCKS_RE = /\b(unlock|unlocks|unlocking|unbolt|unbolts|deadbolt|bolt|latch|chain|key|keys|turn(?:s)? the lock|flip(?:s)? the lock)\b/i;

/**
 * Deterministic: the intent opens or goes through a door, the actor's room
 * has doors and every one of them is LOCKED, and nothing in the intent
 * unlocks anything → the map refuses. One specific door when the intent
 * names it; otherwise the first locked one. Pure.
 */
export function lockedDoorInTheWay(intent: string, map: ActorMap | null): MapDoor | null {
  if (!map || !map.doors.length) return null;
  if (!OPENS_RE.test(intent) || !DOOR_RE.test(intent)) return null;
  if (UNLOCKS_RE.test(intent)) return null;
  const lower = intent.toLowerCase();
  const named = map.doors.find((d) => lower.includes(d.name.toLowerCase()) || d.between.some((b) => b.toLowerCase() !== map.roomName.toLowerCase() && lower.includes(b.toLowerCase())));
  if (named) return named.state === 'locked' ? named : null;
  return map.doors.every((d) => d.state === 'locked') ? map.doors[0] : null;
}

function findDoor(map: ActorMap, ref: string): MapDoor | null {
  const r = ref.trim().toLowerCase();
  return map.doors.find((d) => d.id.toLowerCase() === r)
    ?? map.doors.find((d) => d.name.toLowerCase() === r)
    ?? map.doors.find((d) => d.between.some((b) => b.toLowerCase() === r))
    ?? map.doors.find((d) => r.includes(d.name.toLowerCase()))
    ?? null;
}

/** Open / close / lock on the home's own data; the canvas's tap does the same thing. */
async function writeDoorState(homeId: string, openingId: string, state: DoorState): Promise<void> {
  const loc = await prisma.location.findUnique({ where: { id: homeId }, select: { data: true } });
  if (!loc) return;
  const data = parseData(loc.data);
  const openings = parseOpenings(data.openings);
  const o = openings.find((x) => x.id === openingId);
  if (!o) return;
  o.state = state;
  await prisma.location.update({ where: { id: homeId }, data: { data: JSON.stringify({ ...data, openings }) } });
}

async function findItemByName(campaignId: string, ref: string, where: Record<string, unknown>) {
  const r = ref.trim();
  const rows = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', ...where }, select: { id: true, name: true, holderId: true, locationId: true } });
  return rows.find((i) => i.id === r) ?? rows.find((i) => i.name.toLowerCase() === r.toLowerCase()) ?? rows.find((i) => r.toLowerCase().includes(i.name.toLowerCase())) ?? null;
}

export interface ApplyReport {
  applied: string[];
  refused: string[];
}

/**
 * Apply a resolved act's effects to the map. Never throws; each effect lands
 * or is refused with a reason. One `character_update` broadcast at the end
 * when anything moved, so open canvases re-read.
 */
export async function applyActEffects(campaignId: string, actorCharacterId: string, effects: ActEffect[]): Promise<ApplyReport> {
  const report: ApplyReport = { applied: [], refused: [] };
  if (!effects.length) return report;
  const actor = await prisma.character.findUnique({ where: { id: actorCharacterId }, select: { id: true, name: true, campaignId: true, campaign: { select: { gmUserId: true } } } });
  if (!actor || actor.campaignId !== campaignId) { report.refused.push('actor not in this campaign'); return report; }
  let map = await actorMap(actorCharacterId);

  for (const e of effects) {
    try {
      switch (e.op) {
        case 'door': {
          if (!map) { report.refused.push(`door "${e.door}": the actor stands nowhere on the map`); break; }
          const d = findDoor(map, e.door);
          if (!d) { report.refused.push(`door "${e.door}": no such door touches ${map.roomName}`); break; }
          if (d.state === 'locked' && e.state === 'open') { report.refused.push(`door "${d.name}": locked — it has to be unlocked before it opens`); break; }
          if (d.state === e.state) { report.applied.push(`door "${d.name}" already ${e.state}`); break; }
          await writeDoorState(d.homeId, d.id, e.state);
          d.state = e.state;
          report.applied.push(`door "${d.name}" → ${e.state}`);
          break;
        }
        case 'take': {
          if (!map) { report.refused.push(`take "${e.item}": the actor stands nowhere on the map`); break; }
          const item = await findItemByName(campaignId, e.item, { holderId: null, locationId: map.roomId });
          if (!item) { report.refused.push(`take "${e.item}": nothing by that name lies in ${map.roomName}`); break; }
          await prisma.$transaction([
            prisma.entityRelationship.deleteMany({ where: { sourceId: item.id, relationshipType: REL } }),
            prisma.campaignItem.update({ where: { id: item.id }, data: { holderId: actor.id, locationId: map.roomId } }),
          ]);
          report.applied.push(`${actor.name} now holds "${item.name}"`);
          break;
        }
        case 'give': {
          const item = await findItemByName(campaignId, e.item, { holderId: actor.id });
          if (!item) { report.refused.push(`give "${e.item}": ${actor.name} is not holding it`); break; }
          const people = await prisma.character.findMany({ where: { campaignId, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } }, select: { id: true, name: true } });
          const to = people.find((p) => p.id === e.to) ?? people.find((p) => p.name.toLowerCase() === e.to.trim().toLowerCase()) ?? people.find((p) => e.to.toLowerCase().includes(p.name.toLowerCase()));
          if (!to) { report.refused.push(`give "${item.name}": no one called "${e.to}" here`); break; }
          const toRel = await prisma.entityRelationship.findFirst({ where: { sourceId: to.id, relationshipType: REL }, select: { targetId: true } });
          // A hand-over needs both in one room (HW4 2026-10-24: a five held out through a locked door).
          if (map && toRel && toRel.targetId !== map.roomId) { report.refused.push(`give "${item.name}": ${to.name} is not in ${map.roomName}`); break; }
          await prisma.campaignItem.update({ where: { id: item.id }, data: { holderId: to.id, ...(toRel ? { locationId: toRel.targetId } : {}) } });
          report.applied.push(`"${item.name}" handed to ${to.name}`);
          break;
        }
        case 'put': {
          const item = await findItemByName(campaignId, e.item, { holderId: actor.id });
          if (!item) { report.refused.push(`put "${e.item}": ${actor.name} is not holding it`); break; }
          const r = await placeItem(campaignId, { item: item.id, into: e.into });
          report.applied.push(`"${item.name}" put ${r.into.kind === 'location' ? 'in' : 'into'} ${r.into.name}`);
          break;
        }
        case 'move': {
          const locs = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true } });
          const to = locs.find((l) => l.id === e.to) ?? locs.find((l) => l.name.toLowerCase() === e.to.trim().toLowerCase()) ?? locs.find((l) => e.to.toLowerCase().includes(l.name.toLowerCase()));
          if (!to) { report.refused.push(`move: no place called "${e.to}"`); break; }
          if (map && to.id === map.roomId) { report.applied.push(`already in ${to.name}`); break; }
          // A step into the next room goes through its door; a locked one stops it.
          const between = map?.doors.find((d) => d.between.some((b) => b.toLowerCase() === to.name.toLowerCase()));
          if (between && between.state === 'locked') { report.refused.push(`move to ${to.name}: the ${between.name} is locked`); break; }
          await moveCharacterToLocation(actor.campaign?.gmUserId ?? '', 'WATCHER', { characterId: actor.id, locationId: to.id });
          report.applied.push(`${actor.name} → ${to.name}`);
          map = await actorMap(actorCharacterId);
          break;
        }
      }
    } catch (err) {
      report.refused.push(`${e.op}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (report.applied.length) {
    try { broadcastEvent(campaignId, { kind: 'character_update', characterId: actor.id, characterName: actor.name, fields: ['world'] }); } catch { /* canvases re-read on their own */ }
  }
  return report;
}

/** Defensive read of the adjudicator's `effects` list. Pure. */
export function parseActEffects(raw: unknown): ActEffect[] {
  if (!Array.isArray(raw)) return [];
  const out: ActEffect[] = [];
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  for (const e of raw.slice(0, 8)) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    switch (r.op) {
      case 'door': { const door = s(r.door); const state = s(r.state)?.toLowerCase(); if (door && (state === 'open' || state === 'closed' || state === 'locked')) out.push({ op: 'door', door, state }); break; }
      case 'take': { const item = s(r.item); if (item) out.push({ op: 'take', item }); break; }
      case 'give': { const item = s(r.item); const to = s(r.to); if (item && to) out.push({ op: 'give', item, to }); break; }
      case 'put': { const item = s(r.item); const into = s(r.into); if (item && into) out.push({ op: 'put', item, into }); break; }
      case 'move': { const to = s(r.to); if (to) out.push({ op: 'move', to }); break; }
      default: break;
    }
  }
  return out;
}
