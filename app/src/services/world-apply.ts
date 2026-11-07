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
import { locationAliases } from '@/lib/location-aliases';
import 'server-only';
import { prisma } from '@/lib/db';
import { parseOpenings, type DoorState } from '@/lib/canvas-geometry';
import { placeItem } from '@/services/placement';
import { moveCharacterToLocation } from '@/services/character-location';
import { broadcastEvent } from '@/lib/campaign-stream';
import { syncDoorFact } from '@/services/door-facts';
import { writeDoorState } from '@/services/door-state';
import { resolveMoveRef, moveBeing, describeMove, leaveMap, arriveOnMap, locationPointOn, driveVehicle, type MoveTarget } from '@/services/being-movement';
import { ridingOf, decideRide, seatBeingIn } from '@/services/being-inside';
import { loadWorldLevel, levelOfLocation, thingStanding, beingStanding, clearBeingPoint } from '@/services/spatial-world';
import { perceiveMapChange } from '@/services/spatial-perception';
import { placesOnLevels } from '@/services/elsewhere-world';

export type ActEffect =
  | { op: 'door'; door: string; state: DoorState }
  | { op: 'take'; item: string }
  | { op: 'give'; item: string; to: string }
  | { op: 'put'; item: string; into: string }
  /** Money changes hands (Michael 2026-11-01): the AMOUNT; the engine picks the bills from what the actor carries (services/parts). */
  | { op: 'pay'; to: string; amount: number; currency?: string }
  | { op: 'move'; to: string }
  /** A sound the act causes somewhere other than the actor: a called phone rings where IT is, a thrown thing lands. */
  | { op: 'sound'; at: string; text: string; words?: string; kind?: 'call' | 'text' | 'other' }
  /** The actor answers (or silences, or declines) a signalling thing they hold — a ringing phone picked up, a buzzer stopped. */
  | { op: 'answer'; item: string }
  /** The one who set a signal off ends it from their side (hangs up, cancels, stops knocking): every live signal the actor caused. */
  | { op: 'stop' };

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
  /** Names of the rooms filed under the home (a door whose far side is none of them leaves the home). */
  homeRooms?: string[];
}

/**
 * A LOCK IS WORKED FROM THE INSIDE (HW10 2026-10-29): the actor stands inside the home; a locked door of that home whose
 * far side is not one of its rooms (the landing, the street) has its deadbolt under the actor's hand — it does not block
 * her, and "opens the door" unlocks it first. A locked door between two rooms of the home keeps its lock. Pure.
 */
export function lockOnActorsSide(map: ActorMap, d: MapDoor): boolean {
  // The actor's room is filed under the home (that is how the map was built), so the actor is inside it; the door is of
  // that home; and its far side is not one of the home's rooms. Without the home's rooms listed nothing can be told — locked.
  if (d.homeId !== map.home.id || !map.homeRooms) return false;
  const lower = (x: string) => x.trim().toLowerCase();
  const inside = new Set([...map.homeRooms, map.home.name].map(lower));
  return d.between.some((b) => !inside.has(lower(b)));
}

const REL = 'located_at';
/** How long a signal on a held thing lasts on its own: a couple of minutes of world time. */
const SIGNAL_SECONDS = 600; // a backstop only: a signal goes on until it is answered or stopped (session 2, 2026-11-02: it lapsed between "continues to ring" lines)
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
  // Best effort (a test's partial prisma, or a bad read, must not take the map down): no rooms listed = nothing can be told about the lock's side.
  let homeRooms: string[] = [];
  try {
    const under = await prisma.entityRelationship.findMany({ where: { targetId: home.id, relationshipType: REL, sourceType: 'LOCATION' }, select: { sourceId: true } });
    homeRooms = under.length ? (await prisma.location.findMany({ where: { id: { in: under.map((u) => u.sourceId) } }, select: { name: true } })).map((r) => r.name) : [];
  } catch { homeRooms = []; }
  return { roomId: room.id, roomName: room.name, home, doors, homeRooms };
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
  /** On another map level: somewhere else entirely, reached only through what is carried (a call). */
  elsewhere?: boolean;
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
    // ANOTHER LEVEL IS ANOTHER PLACE: a being filed on a different level is told only as "elsewhere" — its room's name is not handed over.
    const away = new Set((await placesOnLevels(campaignId, actorCharacterId)).away.map((n) => n.toLowerCase()));
    return others.map((o) => {
      const roomName = roomOf.get(o.id) ?? null;
      const route = map && roomName ? routeBetween(graph, map.roomName, roomName) : null;
      return { id: o.id, name: o.name, roomName, route, ...(roomName && away.has(roomName.toLowerCase()) ? { elsewhere: true } : {}) };
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
    if (w.elsewhere) return `${w.name}: ELSEWHERE, far from here, not on this map — out of sight and out of reach; only what is carried (a phone) reaches across. Nothing of ${w.name}'s place is here.`;
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
  const blocks = (d: MapDoor) => d.state === 'locked' && !lockOnActorsSide(map, d);
  const named = map.doors.find((d) => lower.includes(d.name.toLowerCase()) || d.between.some((b) => b.toLowerCase() !== map.roomName.toLowerCase() && lower.includes(b.toLowerCase())));
  if (named) return blocks(named) ? named : null;
  return map.doors.length && map.doors.every(blocks) ? map.doors[0] : null;
}

function findDoor(map: ActorMap, ref: string): MapDoor | null {
  const r = ref.trim().toLowerCase();
  return map.doors.find((d) => d.id.toLowerCase() === r)
    ?? map.doors.find((d) => d.name.toLowerCase() === r)
    ?? map.doors.find((d) => d.between.some((b) => b.toLowerCase() === r))
    ?? map.doors.find((d) => r.includes(d.name.toLowerCase()))
    ?? null;
}

/** A thing changed hands or rooms: every canvas moves its token in place (2026-10-27). Never throws. */
async function itemChanged(campaignId: string, itemId: string): Promise<void> {
  try {
    const it = await prisma.campaignItem.findUnique({ where: { id: itemId }, select: { id: true, name: true, holderId: true, locationId: true } });
    if (!it) return;
    const holder = it.holderId ? await prisma.character.findUnique({ where: { id: it.holderId }, select: { name: true } }) : null;
    // Fog of war: graded where the thing now lies (on its holder, or its spot in the room).
    let seen: Awaited<ReturnType<typeof perceiveMapChange>>;
    try {
      const { map } = await loadWorldLevel(campaignId, await levelOfLocation(it.locationId));
      const standing = await thingStanding(map, it.id);
      if (standing) seen = await perceiveMapChange(campaignId, { kind: 'thing', entityId: it.id, at: standing.point, roomId: standing.room?.id ?? it.locationId, stored: standing.stored }, { map });
    } catch { /* ungraded: everyone sees */ }
    broadcastEvent(campaignId, { kind: 'item_changed', itemId: it.id, itemName: it.name, holderId: it.holderId, holderName: holder?.name ?? null, locationId: it.locationId, ...seen });
  } catch { /* canvases re-read on their own */ }
}

/** The other room is joined to the actor's by exactly one passage and it is open (an open door, an archway): a hand reaches across it. */
async function withinReachThroughOpenWay(campaignId: string, map: ActorMap, otherRoomId: string): Promise<boolean> {
  try {
    const locs = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } });
    const other = locs.find((l) => l.id === otherRoomId);
    if (!other) return false;
    const route = routeBetween(passageGraph(locs.flatMap((l) => parseOpenings(parseData(l.data).openings))), map.roomName, other.name);
    return !!route && route.length === 1 && (route[0].kind !== 'door' || route[0].state === 'open');
  } catch { return false; }
}

/** The act's own words say the lock/bolt/latch was worked (so an open on a locked door is unlock-then-open). Pure. */
const LOCK_WORKED_RE = /\b(?:unlock\w*|unbolt\w*|dead-?bolt\w*|bolt\w*|latch\w*|keys?|(?:turn|flip|slid|slide|draw|drew|drawn|retract|throw|threw|click|snap)\w*\s+(?:back\s+)?(?:the\s+)?(?:lock|bolt|deadbolt|latch))\b/i;
export function actWorksTheLock(actText: string | undefined): boolean {
  return !!actText && LOCK_WORKED_RE.test(actText);
}

async function findItemByName(campaignId: string, ref: string, where: Record<string, unknown>) {
  const r = ref.trim();
  const rows = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', ...where }, select: { id: true, name: true, holderId: true, locationId: true } });
  return rows.find((i) => i.id === r) ?? rows.find((i) => i.name.toLowerCase() === r.toLowerCase()) ?? rows.find((i) => r.toLowerCase().includes(i.name.toLowerCase())) ?? null;
}

export interface ApplyReport {
  applied: string[];
  refused: string[];
  /** Sounds the act caused elsewhere, each placed: the table narrates them so whoever is there perceives them (HW9).
   *  A sound at a DOOR (a knock, stretch 2026-10-31) names the rooms on both sides in `rooms`. */
  sounds?: Array<{ text: string; at: string; locationId: string | null; rooms?: string[] }>;
  /** Finding 33 (2026-11-05): a message READ by the act — the words are handed to the reader as what they read, never narrated to the room. */
  read?: Array<{ by: string; item: string; words: string; from?: string }>;
  /** Finding 86 (2026-11-05): the act changed the actor's ROOM — from where to where (names as the map has them). Data, not prose. */
  moved?: { from: string | null; to: string };
}

/**
 * The thing a sound is said to be at, and the room it is in (a held thing is with its holder). Null when unknown.
 * A sound "at a person" is refused (HW10 2026-10-29: the adjudicator put the ring "at Kristopher" when the Watcher's line
 * already said he heard it, and he heard it twice) — a person's senses carry the act; only a THING is a place a sound comes from.
 * The name is matched loosely (HW10: "Violet's smartphone" is "Her phone" — the model names things as it likes): the thing's
 * own name, the holder's possessive with the thing's head noun (named-things), then any held thing whose head noun ends the
 * model's noun or vice versa ("smartphone" ~ "phone"), owner first.
 */
async function soundSite(campaignId: string, at: string): Promise<{ kind: 'thing'; name: string; locationId: string | null; itemId: string; holderId: string | null } | { kind: 'being'; name: string } | { kind: 'door'; name: string; locationId: string | null; rooms: string[] } | null> {
  const key = at.trim().toLowerCase().replace(/^the\s+/, '');
  // A door of any home on the map (a knock sounds at the door and is heard on both sides of it).
  if (/\b(door|doorway|gate)\b/.test(key)) {
    const locs = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } });
    for (const loc of locs) {
      for (const o of parseOpenings(parseData(loc.data).openings)) {
        if (o.kind !== 'door') continue;
        const name = (o.name ?? '').toLowerCase();
        if (name && (name === key || key.includes(name) || name.includes(key))) {
          const inside = await prisma.location.findFirst({ where: { campaignId, name: { in: o.between } }, select: { id: true } }).catch(() => null);
          return { kind: 'door', name: o.name ?? `door between ${o.between.join(' and ')}`, locationId: inside?.id ?? loc.id, rooms: o.between };
        }
      }
    }
  }
  const beings = await prisma.character.findMany({ where: { campaignId, status: { notIn: ['DEAD', 'RETIRED'] } }, select: { id: true, name: true } });
  const items = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, name: true, holderId: true, locationId: true } });
  const { matchNamedThings, headNoun } = await import('@/sim/senses/named-things');
  const { roomIdOf } = await import('@/services/spatial-world');
  const being = beings.find((b) => b.name.toLowerCase() === key || b.name.toLowerCase().split(/\s+/)[0] === key);
  if (being) return { kind: 'being', name: being.name };
  let thing: (typeof items)[number] | undefined = items.find((i) => i.name.toLowerCase() === key || i.name.toLowerCase().replace(/^(?:the|her|his)\s+/, '') === key) ?? matchNamedThings(at, items, beings)[0];
  if (!thing) {
    // "Violet's smartphone", "her cell": the owner named, then the noun loosely against what they hold.
    const noun = headNoun(at);
    const owner = beings.find((b) => new RegExp(`\\b${b.name.split(/\\s+/)[0]}(?:'s|s)\\b`, 'i').test(at));
    const loose = (i: { name: string }) => { const n = headNoun(i.name); return n.length >= 3 && noun.length >= 3 && (noun.endsWith(n) || n.endsWith(noun)); };
    thing = (owner ? items.filter((i) => i.holderId === owner.id) : []).find(loose) ?? (owner ? undefined : items.find(loose));
  }
  if (!thing) return null;
  return { kind: 'thing', name: thing.name, locationId: thing.holderId ? await roomIdOf(thing.holderId) : thing.locationId, itemId: thing.id, holderId: thing.holderId };
}

/**
 * A SOUND IS ONLY AT A THING THE ACT CAN AFFECT (2026-11-02: the call became "sound at Mozzarella (cooler)", a thing at Chess
 * Pizza on another level). Allowed: a thing the actor holds, a thing lying in the actor's own place, or a thing held by a person
 * the act addresses (the callee's phone). Nothing else — a random item in another place is refused. Pure.
 */
export function soundMayLandAt(o: { holderId: string | null; thingRoomId: string | null; actorId: string; actorRoomIds: string[]; addressedIds: string[] }): boolean {
  if (o.holderId) return o.holderId === o.actorId || o.addressedIds.includes(o.holderId);
  return !!o.thingRoomId && o.actorRoomIds.includes(o.thingRoomId);
}

/** The beings an act addresses: any other being whose first name or full name the text (the act, the sound's target) speaks. Pure. */
export function addressedBeings(texts: string[], beings: Array<{ id: string; name: string }>, actorId: string): string[] {
  const hay = texts.join(' \n ').toLowerCase();
  return beings.filter((b) => b.id !== actorId).filter((b) => {
    const n = b.name.toLowerCase().trim();
    const first = n.split(/\s+/)[0] ?? n;
    return [n, first].some((w) => w.length >= 3 && new RegExp(`\\b${w.replace(/[^a-z0-9' ]/g, '')}\\b`).test(hay));
  }).map((b) => b.id);
}

/**
 * WITHIN REACH OF A SIGNAL (2026-11-02): a person the act names who stands on ANOTHER map level is out of hands' reach, but
 * what they carry can sound (a call rings THEIR device, never the caller's own). Lines name only the carried things — never
 * the person's room or surroundings. Not named, same level, or carrying nothing → nothing. Pure.
 */
export function signalReachLines(texts: string[], rows: Array<{ id: string; name: string; elsewhere?: boolean; carried: string[] }>, actorId: string): string[] {
  const named = new Set(addressedBeings(texts, rows.map((r) => ({ id: r.id, name: r.name })), actorId));
  const lines = rows.filter((r) => named.has(r.id) && r.elsewhere && r.carried.length).map((r) => `${r.name} carries: ${r.carried.join(', ')}`);
  if (!lines.length) return [];
  return ['## Within reach of a signal (not of hands)', ...lines, '(These can SOUND — {"op":"sound","at":<the thing>} — when the act reaches them across the distance. Never take, give or put them; nothing else of that person\'s place is known here.)'];
}

/**
 * Apply a resolved act's effects to the map. Never throws; each effect lands
 * or is refused with a reason. One `character_update` broadcast at the end
 * when anything moved, so open canvases re-read.
 */
export async function applyActEffects(campaignId: string, actorCharacterId: string, effects: ActEffect[], actText?: string, opts: { narrated?: boolean } = {}): Promise<ApplyReport> {
  const report: ApplyReport = { applied: [], refused: [] };
  if (!effects.length) return report;
  const actor = await prisma.character.findUnique({ where: { id: actorCharacterId }, select: { id: true, name: true, campaignId: true, campaign: { select: { gmUserId: true } } } });
  if (!actor || actor.campaignId !== campaignId) { report.refused.push('actor not in this campaign'); return report; }
  let map = await actorMap(actorCharacterId);

  for (const e of effects) {
    try {
      switch (e.op) {
        case 'sound': {
          // Where it sounds: the named thing (held → with its holder) or the named being; the text is what the table narrates.
          const where = await soundSite(campaignId, e.at);
          if (!where) { report.refused.push(`sound at "${e.at}": nothing by that name here`); break; }
          if (where.kind === 'being') { report.refused.push(`sound at ${where.name}: a person's senses carry the act; a sound comes from a thing`); break; }
          if (where.kind === 'thing') {
            const people = await prisma.character.findMany({ where: { campaignId, status: { notIn: ['DEAD', 'RETIRED'] } }, select: { id: true, name: true } });
            const addressedIds = addressedBeings([actText ?? '', e.at], people, actor.id);
            // A call names no one ("the bill she gave him… hits dial"): whoever the caller KNOWS on another level is reachable
            // through a device the caller holds (2026-11-02).
            const holdsSomething = await prisma.campaignItem.count({ where: { campaignId, holderId: actor.id, status: 'ACTIVE' } });
            if (holdsSomething) { const { knownElsewhere } = await import('./elsewhere-world'); for (const k of await knownElsewhere(campaignId, actor.id)) if (!addressedIds.includes(k)) addressedIds.push(k); }
            const actorRoomIds = [map?.roomId, map?.home.id].filter((x): x is string => !!x);
            // SPEECH IN THE SAME ROOM IS NEVER A MESSAGE (Michael 2026-11-06, session 6: "these phantom texts are ruining an otherwise
            // decent scene" — Kristopher asked her a question across the coffee-shop table and the adjudicator ALSO sent it to her phone,
            // which she then read and answered a second time). When the actor and the holder of the thing stand in the same place, a sound
            // at that thing is refused unless the line itself says the act was a message or a call. This reads the Watcher's/being's own
            // words for the verb of sending — a grammar check on the line, not a list of what may be said.
            // The other party: the holder of the thing when it is someone else's; when the sound is at the actor's OWN device
            // (session 6, 07:56: the adjudicator put "Violet's phone chimes" at Kristopher's Work phone), whoever the line addressed.
            let otherIds = where.holderId && where.holderId !== actor.id ? [where.holderId] : addressedIds.filter((id) => id !== actor.id);
            // Session 6, 08:38: "…then he replies. \"I'll handle with care…\"" named nobody, so nobody was addressed and the guard had no other
            // party. A QUOTED line that sounds the speaker's own device, with nobody addressed, is checked against everyone in play: a line of
            // speech does not ring the speaker's phone. An unquoted "His phone rings" is not speech and still sounds.
            if (!otherIds.length && where.holderId === actor.id) {
              const { actorWordsFromIntent } = await import('./item-signal');
              if (actorWordsFromIntent(actText)) otherIds = people.map((c) => c.id).filter((id) => id !== actor.id);
            }
            if (otherIds.length) {
              const places = await prisma.entityRelationship.findMany({
                where: { campaignId, relationshipType: 'located_at', sourceType: 'CHARACTER', sourceId: { in: [actor.id, ...otherIds] } },
                select: { sourceId: true, targetId: true },
              });
              const mine = places.filter((r) => r.sourceId === actor.id).map((r) => r.targetId);
              const theirs = places.filter((r) => otherIds.includes(r.sourceId)).map((r) => r.targetId);
              const together = mine.length > 0 && mine.some((id) => theirs.includes(id));
              const saysSent = /\b(?:text(?:s|ed|ing)?|messag(?:e|es|ed|ing)|send(?:s|ing)?|sent|call(?:s|ed|ing)?|dial(?:s|ed|ing)?|voicemail|writes?\s+back|repl(?:y|ies|ied|ying)\s+(?:by|on|over)|types?)\b/i.test(actText ?? '');
              if (together && !saysSent) {
                const holderName = (await prisma.character.findUnique({ where: { id: otherIds[0] }, select: { name: true } }).catch(() => null))?.name ?? 'the other';
                report.refused.push(`sound at ${where.name}: ${actor.name} and ${holderName} are in the same place — that was said, not sent`);
                break;
              }
            }
            if (!soundMayLandAt({ holderId: where.holderId, thingRoomId: where.locationId, actorId: actor.id, actorRoomIds, addressedIds })) {
              report.refused.push(`sound at ${where.name}: ${actor.name}'s act cannot reach it — not held by ${actor.name} or the person addressed, and not in ${map?.roomName ?? 'the actor\'s place'}`);
              break;
            }
          }
          // WHOSE THING (session 2 live, 2026-11-03: the table read "Her phone rings."): a sound at a held thing that opens on a
          // bare possessive names its holder, so the page and every being read whose it is.
          let soundText = e.text;
          if (where.kind === 'thing' && where.holderId && /^(?:her|his|their)\s/i.test(soundText)) {
            const holderName = (await prisma.character.findUnique({ where: { id: where.holderId }, select: { name: true } }).catch(() => null))?.name?.split(/\s+/)[0];
            if (holderName) soundText = soundText.replace(/^(?:her|his|their)\s/i, `${holderName}'s `);
          }
          (report.sounds ??= []).push({ text: soundText, at: where.name, locationId: where.locationId, ...(where.kind === 'door' ? { rooms: where.rooms } : {}) });
          // A sound at a thing someone ELSE holds is a STATE of that thing until answered (2026-11-02): the holder is told it every beat.
          if (where.kind === 'thing' && where.holderId) {
            try {
              const { clockNow } = await import('./table-clock');
              const { secondsToCycles } = await import('@/types/time');
              const { withSignal, signalCause, liveSignal, actorWordsFromIntent } = await import('./item-signal');
              const { cycle, ts } = await clockNow(campaignId);
              // Finding 60 (2026-11-05): a reply lands on the phone the message came from (fromItem), when the receiver still holds it.
              if (where.holderId !== actor.id) {
                const { replyTargetItem } = await import('./item-signal');
                const { withMessages } = await import('./world-messages');
                const mineAll = await withMessages(campaignId, await prisma.campaignItem.findMany({ where: { campaignId, holderId: actor.id, status: 'ACTIVE' }, select: { id: true, data: true } }), cycle);
                const target = replyTargetItem(mineAll, where.holderId, cycle);
                if (target && target !== where.itemId) {
                  const t = await prisma.campaignItem.findUnique({ where: { id: target }, select: { id: true, name: true, holderId: true, status: true } });
                  if (t && t.holderId === where.holderId && t.status === 'ACTIVE') { where.itemId = t.id; where.name = t.name; }
                }
              }
              const row = await prisma.campaignItem.findUnique({ where: { id: where.itemId }, select: { data: true } });
              const rowData = parseData(row?.data ?? null);
              // Who caused it: the actor when it sounds at another's thing; a call already going keeps its caller when the sound is narrated at the actor's own.
              const existing = liveSignal(rowData, cycle);
              const cause = signalCause({ holderId: where.holderId, actorId: actor.id, narrated: opts.narrated, existingBy: existing?.by });
              // Day 6 (2026-11-04): a call or a text is a THING with a state. A message lands as `received` with its words; a ring is
              // `ringing`; a sound narrated at a thing already answered (connected) leaves the open line as it is.
              if (existing?.state === 'connected' && opts.narrated && where.holderId === actor.id) {
                // RULING 9 (Michael 2026-11-04: "Watcher has the rights to rewrite things"): the being had answered, and the Watcher's
                // line rings it again — the line stands. The answer is undone (back to ringing, same caller) and the Watcher is told.
                report.refused.push(`${actor.name} had answered the ${where.name.replace(/^(?:the|her|his|their)\s+/i, '')}; your line rings it again, so the line stands and the answer is undone (ruling 9).`);
              }
              if (cause.record && (existing?.state !== 'connected' || (opts.narrated && where.holderId === actor.id))) {
                const kind = e.kind ?? (e.words ? 'text' : existing?.kind ?? 'call');
                // Finding 33 (GM scene 1, 2026-11-05): a TEXT with no words came in as `ringing`, and "reads the message" then opened a phone
                // line. The KIND decides the state; a text's words fall back to what the actor's line quoted; a received message waits
                // (no end of its own) until it is read.
                // Finding 62 (2026-11-05): only the ACTOR's own words fill a text — never another speaker's quote on the line.
                const quoted = actorWordsFromIntent(actText);
                // "…" is not the message (GM scene 2: the model wrote an ellipsis as the words): words must carry a letter or a digit.
                // Finding 65 (2026-11-05): the Watcher typed "...Meet me at Extra Space Coffee?" and the ledger kept "...Extra Space Coffee shop worker 1?" —
                // the words that came BACK through the cloud (name swap) were stored. A text's words are the sender's RAW quote when the line has
                // one (actText is the local intent, never the cloud's answer); the model's `e.words` serves only when the line quoted nothing.
                // Finding 83 (2026-11-05): the model's `e.words` invented a message ("Yes. Extra Space. Twenty minutes.") and stored it as hers —
                // a TEXT's words come ONLY from the sender's own quote; no quote, nothing is sent.
                const words = kind === 'text' ? quoted : e.words && /[\p{L}\p{N}]/u.test(e.words) ? e.words : undefined;
                const state = kind === 'text' ? 'received' : 'ringing';
                if (kind === 'text' && !words) { report.refused.push(`a text needs the sender's words (${actor.name} wrote none) - nothing was sent`); break; }
                // Finding 60: the sender's own thing, when it is plain which (exactly one thing in their hands carries the line).
                // Finding 60 (live): named by the act, else the thing last used with the receiver, else the only one with history, else the only one held.
                const mineHeld = await prisma.campaignItem.findMany({ where: { campaignId, holderId: actor.id, status: 'ACTIVE' }, select: { id: true, name: true, data: true } });
                const { pickFromItem } = await import('./item-signal');
                const fromItem = pickFromItem(mineHeld.map((m) => ({ id: m.id, name: m.name, data: parseData(m.data ?? null) })), where.holderId, actText);
                if (kind === 'text' && words) {
                  // A MESSAGE IS A RECORD (Michael 2026-11-07): a row in WorldMessage, every moment stamped; the phone shows what it says.
                  const { recordMessage, openMessageFrom } = await import('./world-messages');
                  const replyToId = cause.by ? await openMessageFrom(campaignId, cause.by, where.holderId) : null;
                  await recordMessage({ campaignId, medium: 'text', senderId: cause.by ?? null, senderThingId: fromItem ?? null, recipientId: where.holderId, recipientThingId: where.itemId, content: words, notice: soundText, cycle, replyToId });
                } else {
                  await prisma.campaignItem.update({ where: { id: where.itemId }, data: { data: JSON.stringify(withSignal(rowData, { text: soundText, since: cycle, until: cycle + secondsToCycles(SIGNAL_SECONDS, ts), ...(cause.by ? { by: cause.by } : {}), kind, state, ...(words ? { words } : existing?.words ? { words: existing.words } : {}), ...(fromItem ? { fromItem } : {}) })) } });
                }
              }
              // A REPLY ANSWERS THE MESSAGE (finding 51, 2026-11-05): the actor's own thing that carried the other's unanswered message is settled.
              if (where.holderId) {
                // Finding 69: a reply settles ALL of that sender's read/received messages on the replier's things.
                const { settleReplied } = await import('./world-messages');
                await settleReplied(campaignId, actor.id, where.holderId, cycle);
              }
            } catch (err) { console.warn('[world-apply] signal not recorded (non-fatal):', err); }
          }
          report.applied.push(`sound at ${where.name}: ${soundText}`);
          break;
        }
        case 'answer': {
          const { withoutOneSignal, withSignal, liveSignal, signalInState } = await import('./item-signal');
          const { clockNow } = await import('./table-clock');
          const { cycle } = await clockNow(campaignId);
          let item = await findItemByName(campaignId, e.item, { holderId: actor.id });
          // THE ANSWER TOLD FROM THE CALLER'S SIDE (finding 32, 2026-11-04: "hears the ring stop and someone breathing" left the call
          // RINGING, so nothing crossed the line all run): a thing the ACTOR set ringing, in someone else's hand, is answered by its holder.
          let answeredByHolder: { id: string; name: string } | null = null;
          if (!item) {
            const theirs = await findItemByName(campaignId, e.item, { holderId: { not: null } }).catch(() => null);
            const row0 = theirs ? await prisma.campaignItem.findUnique({ where: { id: theirs.id }, select: { data: true, holderId: true } }) : null;
            const sig0 = row0 ? liveSignal(parseData(row0.data ?? null), cycle) : null;
            if (theirs && row0?.holderId && sig0?.by === actor.id && sig0.state !== 'received') {
              const holder = await prisma.character.findUnique({ where: { id: row0.holderId }, select: { id: true, name: true } }).catch(() => null);
              if (holder) { item = theirs; answeredByHolder = holder; }
            }
          }
          if (!item) { report.refused.push(`answer "${e.item}": ${actor.name} is not holding it`); break; }
          // 2026-11-07: messages are records (world-messages.ts) laid onto the thing for reading; writes go to the thing's OWN data.
          const { withMessages, readConversation } = await import('./world-messages');
          const viewOf = async (id: string) => (await withMessages(campaignId, [{ id, data: (await prisma.campaignItem.findUnique({ where: { id }, select: { data: true } }))?.data ?? null }], cycle))[0].data;
          let d: Record<string, unknown> = await viewOf(item.id);
          let sig = liveSignal(d, cycle);
          // FINDING 72 (live 2026-11-05: "Looks at the message", two phones held, neither with a signal → 'answers "Personal phone"'):
          // an answer needs a LIVE signal. The named thing has none: answer the other thing the actor holds that does; none carries
          // one → refuse quietly, never narrate an answer.
          if (!sig) {
            const held = (await withMessages(campaignId, await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', holderId: actor.id, id: { not: item.id } }, select: { id: true, name: true, data: true } }), cycle))
              .map((h) => ({ ...h, data: JSON.stringify(h.data) }));
            const alt = pickLiveHeld(held, cycle, liveSignal);
            if (!alt) { report.refused.push(`answer: nothing on the ${item.name} to answer`); break; }
            report.applied.push(`nothing on the ${item.name}; ${actor.name} answers the ${alt.item.name} instead`);
            item = { ...item, id: alt.item.id, name: alt.item.name } as typeof item;
            d = alt.data; sig = alt.sig;
          }
          // Day 6 (2026-11-04): answering a RINGING call opens the line (connected: speech crosses both ways until someone hangs up);
          // answering a received message is reading it (the signal is done); answering a thing that is quiet clears whatever was there.
          // Only a RINGING call opens a line (GM scene 5: answering a READ text connected a phone call).
          const own = parseData((await prisma.campaignItem.findUnique({ where: { id: item.id }, select: { data: true } }))?.data ?? null);
          if (sig && (sig.state === 'ringing' || !sig.state) && sig.by) {
            await prisma.campaignItem.update({ where: { id: item.id }, data: { data: JSON.stringify(withSignal(own, signalInState(sig, 'connected'))) } });
            if (answeredByHolder) {
              report.applied.push(`${answeredByHolder.name} answers "${item.name}" — on the line with ${actor.name}`);
              break;
            }
            const caller = await prisma.character.findUnique({ where: { id: sig.by }, select: { name: true } }).catch(() => null);
            report.applied.push(`${actor.name} answers "${item.name}" — on the line with ${caller?.name ?? 'the caller'}`);
          } else if (sig && sig.state === 'received') {
            // Reading a message (finding 33): the WORDS are what the reader now has — handed as what was read. The message stays on the
            // thing as `read` (Day 8, 2026-11-05): a human player would write back or let it be; "write back" stays on the list until then.
            // OPENING THE CONVERSATION (Michael 2026-11-07: "when I open the text messages I'm going to read all of those text messages, in
            // chronological order"): every unread message from that sender is read, oldest first, whatever words the act used. A read
            // message waits for an answer for a while (world-messages READ_WAIT_SECONDS), then it is simply a message that was read.
            // Reading at the being's PACE within the beat's span is the time law (TIME-LAW-2026-11-07.md), not built yet.
            const readMsgs = await readConversation(campaignId, item.id, cycle, sig.by ?? null);
            const sender = sig.by ? await prisma.character.findUnique({ where: { id: sig.by }, select: { name: true } }).catch(() => null) : null;
            for (const m of readMsgs) {
              report.applied.push(`${actor.name} reads the message on "${item.name}"${sender?.name ? ` from ${sender.name}` : ''}: "${m.content}"`);
              (report.read ??= []).push({ by: actor.id, item: item.name, words: m.content, ...(sender?.name ? { from: sender.name } : {}) });
            }
          } else if (sig && sig.state === 'read') {
            // Looking at a read message again changes nothing: it stays read, still unanswered (writing back is a sound op on the other's thing).
            report.applied.push(`${actor.name} looks at the message on "${item.name}" again; it stays read, unanswered`);
          } else {
            await prisma.campaignItem.update({ where: { id: item.id }, data: { data: JSON.stringify(sig ? withoutOneSignal(own, sig) : own) } });
            report.applied.push(`${actor.name} answers "${item.name}"`);
          }
          break;
        }
        case 'stop': {
          const { clockNow } = await import('./table-clock');
          const { liveSignals, withoutSignalsBy } = await import('./item-signal');
          const { cycle } = await clockNow(campaignId);
          const rows = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', holderId: { not: null } }, select: { id: true, name: true, data: true, holderId: true } });
          const ended: string[] = [];
          for (const r of rows) {
            const d = parseData(r.data ?? null);
            const was = liveSignals(d, cycle).filter((x) => x.by === actor.id).pop();
            if (!was) continue;
            await prisma.campaignItem.update({ where: { id: r.id }, data: { data: JSON.stringify(withoutSignalsBy(d, actor.id)) } });
            ended.push(r.name);
            // THE HOLDER HEARS IT END (session 2, 2026-11-02): the ringing stopping is something that happens at the holder's place.
            // Day 6 (2026-11-04): and what it was — a call that rang out is a missed call; an open line that ends has gone dead.
            const holder = r.holderId ? await prisma.character.findUnique({ where: { id: r.holderId }, select: { name: true } }) : null;
            const at = r.holderId ? await prisma.entityRelationship.findFirst({ where: { sourceId: r.holderId, relationshipType: 'located_at' }, select: { targetId: true } }) : null;
            const thing = r.name.replace(/^(?:the|her|his|their|my)\s+/i, '');
            const whose = holder?.name ? `${holder.name.split(/\s+/)[0]}'s ${thing}` : `The ${thing}`;
            const endText = was.state === 'connected' ? `${whose}: the line goes dead; the call is over.` : was.kind === 'call' || !was.kind ? `${whose} goes quiet — a missed call.` : `${whose} goes quiet.`;
            (report.sounds ??= []).push({ text: endText, at: r.name, locationId: at?.targetId ?? null });
          }
          if (ended.length) report.applied.push(`${actor.name} stops what they set off: ${ended.join(', ')}`);
          else report.refused.push(`stop: nothing ${actor.name} set off is still going`);
          break;
        }
        case 'door': {
          if (!map) { report.refused.push(`door "${e.door}": the actor stands nowhere on the map`); break; }
          const d = findDoor(map, e.door);
          if (!d) { report.refused.push(`door "${e.door}": no such door touches ${map.roomName}`); break; }
          const homeRef = { name: map.home.name };
          if (d.state === 'locked' && e.state === 'open') {
            if (!actWorksTheLock(actText) && !lockOnActorsSide(map, d)) {
              report.refused.push(`door "${d.name}": locked — it has to be unlocked before it opens`);
              // The model's "open" fact for this door must not stand against the map.
              await syncDoorFact(campaignId, homeRef, d).catch(() => undefined);
              break;
            }
            // Compound act ("turns the deadbolt and then the knob"): unlock, then open.
            await writeDoorState(campaignId, d.homeId, d.id, 'closed');
            await writeDoorState(campaignId, d.homeId, d.id, 'open');
            d.state = 'open';
            report.applied.push(`door "${d.name}" unlocked, then opened`);
            break;
          }
          if (d.state === e.state) {
            report.applied.push(`door "${d.name}" already ${e.state}`);
            await syncDoorFact(campaignId, homeRef, d).catch(() => undefined);
            break;
          }
          const was = d.state;
          await writeDoorState(campaignId, d.homeId, d.id, e.state);
          d.state = e.state;
          report.applied.push(was === 'open' && e.state === 'locked' ? `door "${d.name}" shut, then locked` : `door "${d.name}" → ${e.state}`);
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
          await itemChanged(campaignId, item.id);
          break;
        }
        case 'give': {
          const item = await findItemByName(campaignId, e.item, { holderId: actor.id });
          if (!item) { report.refused.push(`give "${e.item}": ${actor.name} is not holding it`); break; }
          const people = await prisma.character.findMany({ where: { campaignId, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } }, select: { id: true, name: true } });
          const to = people.find((p) => p.id === e.to) ?? people.find((p) => p.name.toLowerCase() === e.to.trim().toLowerCase()) ?? people.find((p) => e.to.toLowerCase().includes(p.name.toLowerCase()));
          if (!to) { report.refused.push(`give "${item.name}": no one called "${e.to}" here`); break; }
          const toRel = await prisma.entityRelationship.findFirst({ where: { sourceId: to.id, relationshipType: REL }, select: { targetId: true } });
          // A hand-over needs both in one room (HW4 2026-10-24: a five held out through a locked door) — or within reach through
          // ONE open way between the rooms (2026-10-30: the pizza and the cash change hands across the open doorway, her inside, him on the landing).
          if (map && toRel && toRel.targetId !== map.roomId && !(await withinReachThroughOpenWay(campaignId, map, toRel.targetId))) { report.refused.push(`give "${item.name}": ${to.name} is not within reach from ${map.roomName}`); break; }
          await prisma.campaignItem.update({ where: { id: item.id }, data: { holderId: to.id, ...(toRel ? { locationId: toRel.targetId } : {}) } });
          report.applied.push(`"${item.name}" handed to ${to.name}`);
          await itemChanged(campaignId, item.id);
          break;
        }
        case 'put': {
          const item = await findItemByName(campaignId, e.item, { holderId: actor.id });
          if (!item) { report.refused.push(`put "${e.item}": ${actor.name} is not holding it`); break; }
          const r = await placeItem(campaignId, { item: item.id, into: e.into });
          report.applied.push(`"${item.name}" put ${r.into.kind === 'location' ? 'in' : 'into'} ${r.into.name}`);
          await itemChanged(campaignId, item.id);
          break;
        }
        case 'pay': {
          // MONEY IS PARTS OF A THING (Michael 2026-11-01): the bills come out of what the actor carries — fewest pieces, least
          // over — and land as ONE new thing in the receiver's hands, the payment on its history. Never a give of "the cash".
          const people = await prisma.character.findMany({ where: { campaignId, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } }, select: { id: true, name: true } });
          const person = people.find((p) => p.id === e.to) ?? people.find((p) => p.name.toLowerCase() === e.to.trim().toLowerCase()) ?? people.find((p) => e.to.toLowerCase().includes(p.name.toLowerCase()));
          // MONEY TO A THING OR A PLACE (2026-11-01: the collected cash turned in at the till): the till, a jar, a counter, a room.
          let to: { id: string; name: string; locationId: string | null; kind: 'character' | 'item' | 'location' } | null = person ? { id: person.id, name: person.name, locationId: null, kind: 'character' } : null;
          if (!to) {
            const { resolvePlace } = await import('./placement');
            const place = await resolvePlace(campaignId, e.to).catch(() => null);
            if (place) to = { id: place.id, name: place.name, locationId: place.kind === 'item' ? place.locationId : place.id, kind: place.kind };
          }
          if (!to) { report.refused.push(`pay "${e.to}": no one and nothing by that name here`); break; }
          const toRel = to.kind === 'character' ? await prisma.entityRelationship.findFirst({ where: { sourceId: to.id, relationshipType: REL }, select: { targetId: true } }) : null;
          if (to.kind === 'character') to.locationId = toRel?.targetId ?? null;
          const targetRoom = to.kind === 'character' ? toRel?.targetId ?? null : to.locationId;
          if (map && targetRoom && targetRoom !== map.roomId && !(await withinReachThroughOpenWay(campaignId, map, targetRoom))) { report.refused.push(`pay ${to.name}: not within reach from ${map.roomName}`); break; }
          const { payFromHand } = await import('./parts');
          const cycle = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? null;
          const r = await payFromHand(campaignId, { id: actor.id, name: actor.name }, to, e.amount, { currency: e.currency, because: actText?.trim() || `paid ${to.name}`, cycle });
          if (!r.ok) { report.refused.push(`pay ${to.name} ${e.amount}${e.currency ? ` ${e.currency}` : ''}: ${r.reason}`); break; }
          report.applied.push(`${actor.name} ${to.kind === 'character' ? 'hands' : 'puts'} ${r.words} ${to.kind === 'character' ? 'to' : 'into'} ${to.name}${r.over > 0.004 ? ` — ${r.overWords} over the ${e.amount}` : ''}`);
          for (const id of [r.itemId, ...r.sourceIds]) await itemChanged(campaignId, id);
          break;
        }
        case 'move': {
          // The being WALKS (2026-10-27): the target is a room, a door, a person or a thing; the way is
          // found on the real map, closed doors open on the way, a locked one stops the walk at the door.
          const gmId = actor.campaign?.gmUserId ?? '';
          const resolved = await resolveMoveRef(campaignId, e.to, actor.id);
          if (!resolved) {
            const locs = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } });
            // Finding 97 (2026-11-05): "the coffee shop" must find "the coffee shop on Broadway" (the model does not always write the whole name), and
            // finding 96: a place's aliases ("Extra Space Coffee") name it too. Exact name/alias → the words contain the name → the name/alias contains the words.
            const want = e.to.trim().toLowerCase().replace(/^the\s+/, '');
            const namesOf = (l: { name: string; data: string | null }) => [l.name, ...locationAliases(l.data)].map((n) => n.toLowerCase().replace(/^the\s+/, ''));
            const to = locs.find((l) => l.id === e.to)
              ?? locs.find((l) => namesOf(l).some((n) => n === want))
              ?? locs.find((l) => namesOf(l).some((n) => want.includes(n)))
              ?? (want.length >= 4 ? locs.find((l) => namesOf(l).some((n) => n.includes(want))) : undefined);
            if (!to) {
              // Finding 98 (2026-11-05): "gets out" is its own deed - the rider climbs out even when the destination names nothing.
              const rideOut = await ridingOf(actor.id);
              if (rideOut) { await seatBeingIn(campaignId, actor.id, null, 'sim'); report.applied.push(`${actor.name} gets out of the ${rideOut.containerName}`); }
              report.refused.push(`move: nothing called "${e.to}" on the map`); break;
            }
            if (map && to.id === map.roomId) { report.applied.push(`already in ${to.name}`); break; }
            const toLevel = await levelOfLocation(to.id);
            // DRIVING = THE VEHICLE TRAVELS (finding 68 / #41 vehicle travel, 2026-11-05): a being inside a vehicle that goes to another
            // place does not walk there - the vehicle goes, with everyone inside it. Inside anything else, the being climbs out first.
            const ride = await ridingOf(actor.id);
            if (ride) {
              if (decideRide({ inside: ride, targetKind: 'location' }) === 'drive') {
                const drove = await driveVehicle(campaignId, { id: ride.containerId, name: ride.containerName }, to, toLevel);
                if (!drove.ok) { report.refused.push(`drive to ${to.name}: ${drove.reason}`); break; }
                const others = drove.riders.filter((n) => n !== actor.name);
                report.applied.push(`${actor.name} drives the ${ride.containerName} to ${to.name}${others.length ? ` with ${others.join(' and ')}` : ''}`);
                map = await actorMap(actorCharacterId);
                break;
              }
              await seatBeingIn(campaignId, actor.id, null, 'sim');
              report.applied.push(`${actor.name} gets out of the ${ride.containerName}`);
            }
            if (toLevel === null) {
              // ELSEWHERE (stretch 2026-10-31): a place that exists as facts, not as a drawn room. Walk to the nearest way off
              // the map, then be filed there; the token leaves the level.
              const left = await leaveMap(campaignId, actor.id);
              if (!left.ok) { report.refused.push(`move to ${to.name}: ${left.reason}`); break; }
              await moveCharacterToLocation(gmId, 'WATCHER', { characterId: actor.id, locationId: to.id, snapCanvas: false, broadcast: true });
              await clearBeingPoint(actor.id);
              report.applied.push(`${actor.name} leaves${left.via ? ` by the ${left.via}` : ''} for ${to.name}`);
              map = await actorMap(actorCharacterId);
              break;
            }
            // Drawn, but no room of this level answers to the name (a home shell, another story). Coming from elsewhere: arrive at
            // the way onto the level nearest it. On the map already: a home is reached at its own door from outside.
            const { map: lvl } = await loadWorldLevel(campaignId, toLevel);
            const here = await beingStanding(lvl, actor.id).catch(() => null);
            if (!here) {
              const arrived = await arriveOnMap(campaignId, actor.id, locationPointOn(lvl, to.id), { level: toLevel });
              if (!arrived.ok) { report.refused.push(`move to ${to.name}: ${arrived.reason}`); break; }
              report.applied.push(`${actor.name} arrives by the ${arrived.via} at ${arrived.room}`); if (arrived.room) report.moved = { from: null, to: arrived.room };
              map = await actorMap(actorCharacterId);
            }
            const under = await prisma.entityRelationship.findMany({ where: { targetId: to.id, relationshipType: REL, sourceType: 'LOCATION' }, select: { sourceId: true } });
            const underNames = under.length ? (await prisma.location.findMany({ where: { id: { in: under.map((r) => r.sourceId) } }, select: { name: true } })).map((r) => r.name.toLowerCase()) : [];
            const homeRooms = new Set([...underNames, to.name.toLowerCase()]);
            const door = lvl.portals.find((p) => p.homeId === to.id && p.kind === 'door' && p.between.some((b) => !homeRooms.has(b.toLowerCase())));
            if (door) {
              const walk = await moveBeing(campaignId, actor.id, { kind: 'portal', portalId: door.id, homeId: door.homeId }, { cause: 'sim' });
              if (walk.ok && (walk.feet > 0 || walk.opened.length)) { report.applied.push(describeMove(actor.name, walk)); if (walk.toRoom && walk.toRoom !== walk.fromRoom) report.moved = { from: walk.fromRoom, to: walk.toRoom }; }
              else if (!walk.ok) report.refused.push(`move to ${to.name}: ${walk.reason ?? 'no way'}`);
              map = await actorMap(actorCharacterId);
              break;
            }
            // No door of its own on this level: file the being there (the pre-map fallback).
            const between = map?.doors.find((d) => d.between.some((b) => b.toLowerCase() === to.name.toLowerCase()));
            if (between && between.state === 'locked') { report.refused.push(`move to ${to.name}: the ${between.name} is locked`); break; }
            await moveCharacterToLocation(gmId, 'WATCHER', { characterId: actor.id, locationId: to.id, snapCanvas: true });
            report.applied.push(`${actor.name} → ${to.name}`); report.moved = { from: null, to: to.name };
            map = await actorMap(actorCharacterId);
            break;
          }
          let walk = await moveBeing(campaignId, actor.id, resolved.target, { cause: 'sim' });
          if (!walk.ok && /stands nowhere on the map/.test(walk.reason ?? '')) {
            // Coming from elsewhere: appear at the way onto the level nearest the target, then walk the rest.
            const arrived = await arriveOnMap(campaignId, actor.id, await targetPoint(campaignId, resolved.target));
            if (arrived.ok) {
              report.applied.push(`${actor.name} arrives by the ${arrived.via} at ${arrived.room}`); if (arrived.room) report.moved = { from: null, to: arrived.room };
              walk = await moveBeing(campaignId, actor.id, resolved.target, { cause: 'sim' });
            } else report.refused.push(`move to ${resolved.label}: ${arrived.reason}`);
          }
          // A walk of no feet that opened nothing is no act (HW12 2026-10-31: "Kristopher is already at Entry door" narrated three times).
          if (walk.ok && walk.feet <= 0 && !walk.opened.length && !walk.gotOutOf && !walk.boarded) console.log(`[world-apply] ${actor.name}: already at ${resolved.label} — nothing to apply`);
          else if (walk.ok) { report.applied.push(describeMove(actor.name, walk)); if (walk.toRoom && walk.toRoom !== walk.fromRoom) report.moved = { from: walk.fromRoom, to: walk.toRoom }; }
          else if (!/stands nowhere on the map/.test(walk.reason ?? '')) report.refused.push(`move to ${resolved.label}: ${walk.reason ?? 'no way'}`);
          map = await actorMap(actorCharacterId);
          break;
        }
      }
    } catch (err) {
      report.refused.push(`${e.op}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (report.applied.length || report.refused.length) console.log(`[world-apply] ${actor.name}: ${report.applied.join('; ') || 'nothing moved'}${report.refused.length ? ` · refused: ${report.refused.join('; ')}` : ''}`);
  if (report.applied.length) {
    try { broadcastEvent(campaignId, { kind: 'character_update', characterId: actor.id, characterName: actor.name, fields: ['world'] }); } catch { /* canvases re-read on their own */ }
  }
  return report;
}

/** FINDING 72: the first held thing that carries a live signal (its parsed data and signal), else null. Pure given `live`. */
export function pickLiveHeld<S>(held: Array<{ id: string; name: string; data: string | null }>, cycle: number, live: (d: Record<string, unknown>, cycle: number) => S | null): { item: { id: string; name: string }; data: Record<string, unknown>; sig: S } | null {
  for (const h of held) {
    const data = parseData(h.data ?? null);
    const sig = live(data, cycle);
    if (sig) return { item: { id: h.id, name: h.name }, data, sig };
  }
  return null;
}

/** Where a move target sits on its level, for "the nearest way onto the map"; null when unknown. */
async function targetPoint(campaignId: string, target: MoveTarget): Promise<{ x: number; y: number } | null> {
  try {
    const { map } = await loadWorldLevel(campaignId, null);
    switch (target.kind) {
      case 'point': return target.point;
      case 'room': return locationPointOn(map, target.roomId);
      case 'portal': { const p = map.portals.find((x) => x.id === target.portalId && x.homeId === target.homeId); return p ? { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 } : null; }
      case 'being': return (await beingStanding(map, target.characterId))?.point ?? null;
      case 'thing': return (await thingStanding(map, target.itemId))?.point ?? null;
    }
  } catch { return null; }
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
      case 'pay': {
        const to = s(r.to);
        const amount = typeof r.amount === 'number' ? r.amount : Number(String(r.amount ?? '').replace(/[^0-9.]/g, ''));
        const currency = s(r.currency) ?? undefined;
        if (to && Number.isFinite(amount) && amount > 0) out.push({ op: 'pay', to, amount: Math.round(amount * 100) / 100, ...(currency ? { currency } : {}) });
        break;
      }
      case 'move': { const to = s(r.to); if (to) out.push({ op: 'move', to }); break; }
      case 'answer': { const item = s(r.item); if (item) out.push({ op: 'answer', item }); break; }
      case 'stop': out.push({ op: 'stop' }); break;
      case 'sound': {
        const at = s(r.at); const text = s(r.text); const words = s(r.words); const kind = s(r.kind);
        if (at && text) out.push({ op: 'sound', at, text: text.slice(0, 240), ...(words ? { words: words.slice(0, 600) } : {}), ...(kind === 'call' || kind === 'text' || kind === 'other' ? { kind } : {}) });
        break;
      }
      default: break;
    }
  }
  return out;
}
