/**
 * A being walks (2026-10-27). The one path for every move the simulation,
 * JEWL or the Watcher's narration makes: the target is resolved from the
 * world (a room, a door, a person, a thing — never coordinates), the way is
 * found on the real map (lib/spatial: walls, openings, door states,
 * furniture), closed doors on the way are opened by the walker, a locked one
 * stops the walk at the door, the being's point and room are written, and
 * every open canvas moves the token along the walked path (`token_moved`).
 * The clock is never written by a walk: time passes by the Watcher's
 * exposition (six seconds a round in combat); a walk fits inside it.
 *
 * Rulings: [[ruling-canvas-live-no-reloads-pathfinding-line-of-sight-2026-10-27]],
 * [[ruling-canvas-is-the-physical-map-overlay-cards-2026-10-17]],
 * [[ruling-time-jumps-require-simulation-all-characters-2026-10-24]].
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { broadcastEvent } from '@/lib/campaign-stream';
import type { Point } from '@/lib/canvas-geometry';
import { walkFtPerSFromCelerity } from '@/lib/spatial/pathfinding';
import { findPath, insideOrOn, pathSeconds, portalPassability, roomAt, roomByName, portalsOfRoom, spotInRoom, spotAtPortal, spotBeside, nearestWalkable, crossesBlocking, wayOutDoor, lockedFromMySide, type LevelMap, type Portal, type RoomPoly, type Pace } from '@/lib/spatial';
import { loadWorldLevel, beingStanding, thingStanding, stampBeingPoint, roomIdOf, levelOfBeing, exitPortals } from '@/services/spatial-world';
import { moveCharacterToLocation } from '@/services/character-location';
import { writeDoorState } from '@/services/door-state';
import { perceiveMapChange } from '@/services/spatial-perception';
import { insideOf, seatBeingIn, isVehicle, ridersOf } from '@/services/being-inside';
import { footprintBounds, fractionToWorld, worldToFraction } from '@/lib/canvas-geometry';

/** Where every other being of the campaign stands on this level (for the walker to step around). Never throws. */
async function othersStanding(campaignId: string, exceptId: string, map: LevelMap): Promise<Point[]> {
  try {
    const rows = await prisma.character.findMany({ where: { campaignId, status: { notIn: ['DEAD', 'RETIRED'] }, id: { not: exceptId } }, select: { id: true } });
    const out: Point[] = [];
    for (const r of rows) { const s = await beingStanding(map, r.id); if (s?.stored) out.push(s.point); }
    return out;
  } catch { return []; }
}

export type MoveTarget =
  | { kind: 'room'; roomId: string }
  | { kind: 'portal'; portalId: string; homeId: string }
  | { kind: 'being'; characterId: string }
  | { kind: 'thing'; itemId: string }
  | { kind: 'point'; point: Point };

export interface ResolvedTarget { target: MoveTarget; label: string }

export interface MoveReport {
  ok: boolean;
  reason?: string;
  label: string;
  from: Point;
  to: Point;
  feet: number;
  seconds: number;
  fromRoom: string | null;
  toRoom: string | null;
  /** Doors the walker opened on the way. */
  opened: string[];
  /** A locked door that stopped the walk short. */
  stoppedBy?: string;
  path: Point[];
  /** Finding 68 / #41 vehicle travel, 2026-11-05: the thing the walker climbed out of first (a car, a bed). */
  gotOutOf?: string;
  /** Finding 68 / #41: the vehicle the walk ended in (walked to a vehicle in the same room = got into it). */
  boarded?: string;
  /** Finding 81 (2026-11-05): a move to the room the walker is already in is no act, never a refusal; the rest of the act carries on. */
  already?: boolean;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/^(the|a|an)\s+/, '');
const DOOR_WORD = /\b(door|doorway|threshold|entrance|entry)\b/i;

/**
 * What a move's `to` names, in this order: a door/opening of the actor's room
 * (by name, or "the door" when one door touches the room), a person, a thing
 * on the map, a room. Null when nothing on the map answers to it.
 */
export async function resolveMoveRef(campaignId: string, ref: string, actorCharacterId: string, world?: { map: LevelMap }): Promise<ResolvedTarget | null> {
  const r = norm(ref);
  if (!r) return null;
  const { map } = world ?? await loadWorldLevel(campaignId, await levelOfBeing(actorCharacterId));
  const standing = await beingStanding(map, actorCharacterId);
  const here = standing?.room ?? null;
  const roomPortals = here ? portalsOfRoom(map, here) : map.portals;
  const nameOf = (p: Portal) => norm(p.name);
  // A door by its name, or by the room beyond it ("the bathroom door").
  const byName = roomPortals.find((p) => nameOf(p) === r) ?? map.portals.find((p) => nameOf(p) === r)
    ?? roomPortals.find((p) => r.includes(nameOf(p)));
  if (byName) return { target: { kind: 'portal', portalId: byName.id, homeId: byName.homeId }, label: byName.name };
  if (DOOR_WORD.test(r)) {
    const doors = roomPortals.filter((p) => p.kind === 'door');
    const beyond = doors.find((p) => p.between.some((b) => here && norm(b) !== norm(here.name) && r.includes(norm(b))));
    // Unnamed, with several doors: the way out — never the nearest (HW10 2026-10-29: Violet walked to the bathroom door).
    const pick = beyond ?? (here ? wayOutDoor(map, here, standing?.point ?? null) : doors.length === 1 ? doors[0] : null);
    if (pick) return { target: { kind: 'portal', portalId: pick.id, homeId: pick.homeId }, label: pick.name };
  }
  const people = await prisma.character.findMany({ where: { campaignId, id: { not: actorCharacterId }, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] } }, select: { id: true, name: true } });
  const person = people.find((p) => norm(p.name) === r) ?? people.find((p) => r.includes(norm(p.name)) || norm(p.name).includes(r));
  if (person) return { target: { kind: 'being', characterId: person.id }, label: person.name };
  const things = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, name: true, locationId: true } });
  // FINDING 73 (2026-11-05): a THING in the room the actor stands in answers first ("the counter" is the shop's counter, not another place's).
  const nearby = here ? things.filter((t) => t.locationId === here.id) : [];
  const thing = [nearby, things].flatMap((pool) => [pool.find((t) => norm(t.name) === r) ?? pool.find((t) => r.includes(norm(t.name)))]).find(Boolean);
  if (thing) return { target: { kind: 'thing', itemId: thing.id }, label: thing.name };
  const room = roomByName(map, r) ?? map.rooms.find((x) => r.includes(norm(x.name)) || norm(x.name).includes(r)) ?? null;
  if (room) return { target: { kind: 'room', roomId: room.id }, label: room.name };
  return null;
}

/** The spot a target asks the walker to reach. Null when the target is nowhere on this level. */
async function destinationFor(map: LevelMap, target: MoveTarget, from: Point): Promise<{ point: Point; label: string } | null> {
  switch (target.kind) {
    case 'point': { const p = nearestWalkable(map, target.point, 6); return p ? { point: p, label: 'the spot' } : null; }
    case 'room': {
      const room = map.rooms.find((r) => r.id === target.roomId);
      return room ? { point: spotInRoom(map, room, from), label: room.name } : null;
    }
    case 'portal': {
      const portal = map.portals.find((p) => p.id === target.portalId && p.homeId === target.homeId);
      return portal ? { point: spotAtPortal(map, portal, from), label: portal.name } : null;
    }
    case 'being': {
      const s = await beingStanding(map, target.characterId);
      if (!s) return null;
      const name = (await prisma.character.findUnique({ where: { id: target.characterId }, select: { name: true } }))?.name ?? 'them';
      return { point: besideOnTheSameSide(map, s.point, from), label: name };
    }
    case 'thing': {
      const s = await thingStanding(map, target.itemId);
      if (!s) return null;
      const name = (await prisma.campaignItem.findUnique({ where: { id: target.itemId }, select: { name: true } }))?.name ?? 'it';
      return { point: besideOnTheSameSide(map, s.point, from), label: name };
    }
  }
}

/**
 * "Beside" a target means on the target's own side of any wall: a spot a step
 * from it toward the walker, unless a wall or a shut door lies between the two,
 * in which case the target's own point is the destination and the walk stops
 * where the map stops it (a locked door, 2026-10-27: Kristopher "walking to
 * Violet" ended beside the door on HIS side and the lock never spoke).
 */
function besideOnTheSameSide(map: LevelMap, target: Point, from: Point): Point {
  const spot = spotBeside(map, target, from);
  const between = crossesBlocking(map, target, spot, 'move');
  if (!between.blocked && !between.opens?.length) return spot;
  return nearestWalkable(map, target, 6) ?? target;
}

/** Where a target thing/being lies on this level (its own point), for the ring search. */
async function anchorOf(map: LevelMap, target: MoveTarget): Promise<Point | null> {
  if (target.kind === 'thing') return (await thingStanding(map, target.itemId))?.point ?? null;
  if (target.kind === 'being') return (await beingStanding(map, target.characterId))?.point ?? null;
  return null;
}

/**
 * FINDING 73: the nearest square around `anchor` (rings of 5-ft squares, 16 bearings, out to four squares) that is walkable and
 * that `from` can reach, with the path to it. Nearest to the anchor first, then nearest to the walker. Null when none is reachable
 * (the caller reports the refusal). Pure.
 */
export function reachableSpotNear(map: LevelMap, walkMap: LevelMap, anchor: Point, from: Point, avoid: Point[] = []): { point: Point; path: NonNullable<ReturnType<typeof findPath>> } | null {
  const SQUARE = 5 * 20; // 5 ft in map units (UNITS_PER_FT = 20)
  const cands: Array<{ p: Point; dA: number; dF: number }> = [];
  for (let ring = 1; ring <= 4; ring++) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const c = { x: anchor.x + Math.cos(ang) * ring * SQUARE, y: anchor.y + Math.sin(ang) * ring * SQUARE };
      if (map.obstacles.some((o) => insideOrOn(c, o.points))) continue;
      if (!roomAt(map, c)) continue;
      const w = nearestWalkable(map, c, 1);
      if (!w) continue;
      cands.push({ p: w, dA: Math.hypot(w.x - anchor.x, w.y - anchor.y), dF: Math.hypot(w.x - from.x, w.y - from.y) });
    }
  }
  cands.sort((x, y) => (Math.round(x.dA / SQUARE) - Math.round(y.dA / SQUARE)) || x.dF - y.dF);
  for (const c of cands.slice(0, 64)) {
    const path = findPath(walkMap, from, c.p, { avoid });
    if (path) return { point: c.p, path };
  }
  return null;
}

/** One square (5 ft) from `p` toward the room's centre, on a walkable square; null when nowhere answers. Pure. */
export function stepIntoRoom(map: LevelMap, room: RoomPoly, p: Point): Point | null {
  const n = room.points.length || 1;
  const c = { x: room.points.reduce((a, q) => a + q.x, 0) / n, y: room.points.reduce((a, q) => a + q.y, 0) / n };
  const L = Math.hypot(c.x - p.x, c.y - p.y);
  if (L < 1) return null;
  const step = Math.min(100, L);
  return nearestWalkable(map, { x: p.x + ((c.x - p.x) / L) * step, y: p.y + ((c.y - p.y) / L) * step }, 3);
}

function walkedRoom(map: LevelMap, p: Point): RoomPoly | null { return roomAt(map, p); }

/**
 * Walk a being to a target. Never throws for a refused move — the report says
 * why (no way through, nowhere on the map, stopped at a locked door).
 */
export async function moveBeing(
  campaignId: string,
  characterId: string,
  target: MoveTarget,
  opts: { cause: 'sim' | 'gm' | 'jewl'; pace?: Pace; world?: { map: LevelMap } },
): Promise<MoveReport> {
  const { map } = opts.world ?? await loadWorldLevel(campaignId, await levelOfBeing(characterId));
  const actor = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, campaignId: true, data: true, campaign: { select: { gmUserId: true } } } });
  const empty = (label: string, reason: string): MoveReport => ({ ok: false, reason, label, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, feet: 0, seconds: 0, fromRoom: null, toRoom: null, opened: [], path: [] });
  // The sheet is the dial (2026-10-30): the walk's pace reads Celerity off the sheet when it is there.
  let walkFtPerS: number | undefined;
  try { const sheet = actor?.data ? (JSON.parse(actor.data) as { attributes?: { celerity?: { level?: number } } }) : null; walkFtPerS = walkFtPerSFromCelerity(sheet?.attributes?.celerity?.level); } catch { walkFtPerS = undefined; }
  if (!actor || actor.campaignId !== campaignId) return empty('?', 'not in this campaign');
  // A RIDER WHO WALKS GETS OUT FIRST (finding 68 / #41 vehicle travel, 2026-11-05): a being inside a car, a bed or another being
  // climbs out where the container stands, then walks. Walking to the thing it is inside of is no walk.
  let gotOutOf: string | undefined;
  const riding = await insideOf(characterId);
  if (riding) {
    if (target.kind === 'thing' && target.itemId === riding.containerId) {
      const here = (await beingStanding(map, characterId))?.point ?? { x: 0, y: 0 };
      return { ok: true, label: riding.containerName, from: here, to: here, feet: 0, seconds: 0, fromRoom: null, toRoom: null, opened: [], path: [] };
    }
    await seatBeingIn(campaignId, characterId, null, opts.cause);
    gotOutOf = riding.containerName;
  }
  const standing = await beingStanding(map, characterId);
  if (!standing) return empty('?', `${actor.name} stands nowhere on the map`);
  const dest = await destinationFor(map, target, standing.point);
  if (!dest) return empty('?', 'the target is nowhere on the map');
  // The container's point can sit inside its own drawn shape (a car's body): step out to the nearest standable spot.
  const from = gotOutOf && map.obstacles.some((o) => insideOrOn(standing.point, o.points)) ? (nearestWalkable(map, standing.point, 6) ?? standing.point) : standing.point;
  const fromRoom = standing.room;
  const base = { label: dest.label, from, fromRoom: fromRoom?.name ?? null, ...(gotOutOf ? { gotOutOf } : {}) };

  // A LOCK IS WORKED FROM THE INSIDE (HW10 2026-10-29): a locked door that leaves the home the walker stands in is a closed
  // door to her — the way is found as if it were, and it is unlocked and opened on the way.
  const mine = map.portals.filter((p) => lockedFromMySide(map, p, from));
  const walkMap: LevelMap = mine.length ? { ...map, portals: map.portals.map((p) => (mine.some((m) => m.id === p.id && m.homeId === p.homeId) ? { ...p, state: 'closed' as const } : p)) } : map;
  // Other beings on the level are stepped around when there is room (soft, never a wall).
  const avoid = await othersStanding(campaignId, characterId, map);
  let path = findPath(walkMap, from, dest.point, { avoid });
  // FINDING 81 / 73 (2026-11-05): a walker set down at a way in (out of a car parked at the street door) stands ON the wall line; a
  // shut door there walls the start cell off from the whole room. Step one square into the room, then walk; the doorstep door opens.
  const inner = fromRoom ? stepIntoRoom(map, fromRoom, from) : null;
  const viaInner = (to: Point): NonNullable<ReturnType<typeof findPath>> | null => {
    if (!inner) return null;
    const p2 = findPath(walkMap, inner, to, { avoid });
    return p2 ? { ...p2, points: [from, ...p2.points], feet: p2.feet + Math.hypot(inner.x - from.x, inner.y - from.y) } : null;
  };
  let usedInner = false;
  if (!path) { path = viaInner(dest.point); usedInner = !!path; }
  // FINDING 73 (live 2026-11-05: "goes to the counter" → "no way from the coffee shop on Broadway to the counter"): a thing drawn as an
  // obstacle (the counter, a table) has no standable square of its own; the spot "beside" it can sit behind it or in a pocket. Try the
  // squares around it, nearest first, and stand at the first one the walker can actually reach.
  if (!path && (target.kind === 'thing' || target.kind === 'being')) {
    const around = await anchorOf(map, target);
    let spot = around ? reachableSpotNear(map, walkMap, around, from, avoid) : null;
    if (!spot && around && inner) {
      const s2 = reachableSpotNear(map, walkMap, around, inner, avoid);
      if (s2) { spot = { point: s2.point, path: { ...s2.path, points: [from, ...s2.path.points], feet: s2.path.feet + Math.hypot(inner.x - from.x, inner.y - from.y) } }; usedInner = true; }
    }
    if (spot) { path = spot.path; dest.point = spot.point; }
  }
  // FINDING 81 (2026-11-05): "goes in" to the room the walker already stands in is a no-op, never a refusal; the act's other ops go on.
  if (!path && target.kind === 'room' && fromRoom && target.roomId === fromRoom.id) {
    return { ok: true, ...base, to: from, feet: 0, seconds: 0, toRoom: fromRoom.name, opened: [], path: [], already: true };
  }
  if (!path) return { ...empty(dest.label, `no way from ${fromRoom?.name ?? 'here'} to ${dest.label}`), ...base };

  // Doors the walker passes: a closed one is opened on the way (the one writer tells the facts and the canvases).
  const opened: string[] = [];
  if (usedInner && fromRoom) {
    for (const p of portalsOfRoom(map, fromRoom)) {
      const mid = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
      if (Math.hypot(mid.x - from.x, mid.y - from.y) <= 100 && portalPassability(p).opens && !path.portals.some((q) => q.id === p.id && q.homeId === p.homeId)) {
        if (await writeDoorState(campaignId, p.homeId, p.id, 'open').catch(() => false)) opened.push(p.name);
      }
    }
  }
  for (const p of path.portals) {
    const unlocked = mine.some((m) => m.id === p.id && m.homeId === p.homeId);
    const pass = unlocked ? { opens: true } : portalPassability(p);
    if (pass.opens) {
      const ok = await writeDoorState(campaignId, p.homeId, p.id, 'open').catch(() => false);
      if (ok) opened.push(unlocked ? `${p.name} (unlocked)` : p.name);
    }
  }

  const end = path.points[path.points.length - 1] ?? from;
  const moved = path.points.length > 1 && (Math.abs(end.x - from.x) > 0.5 || Math.abs(end.y - from.y) > 0.5);
  const toRoom = walkedRoom(map, end) ?? fromRoom;
  const seconds = moved ? pathSeconds(path.feet, opts.pace ?? 'walk', walkFtPerS) : 0;

  if (moved) {
    const filedId = await roomIdOf(characterId);
    if (toRoom && filedId !== toRoom.id) {
      await moveCharacterToLocation(actor.campaign?.gmUserId ?? '', 'WATCHER', { characterId, locationId: toRoom.id, broadcast: false });
    }
    const placedAt = await stampBeingPoint(characterId, end);
    // The clock is NEVER written here (Mike 2026-10-28): time passes by the Watcher's exposition — or six
    // seconds a round in combat — and a walk fits inside the time that passed. `seconds` is what the walk
    // takes, for the table to read against the span, not a charge.
    try {
      // Fog of war: who saw the walk, who only heard it, who nothing (services/spatial-perception).
      const seen = await perceiveMapChange(campaignId, { kind: 'being', entityId: characterId, at: end, roomId: toRoom?.id ?? null, path: path.points }, { map });
      // A walk ends somewhere: the position fact follows (Mike 2026-10-29).
      { const { beingPlaced } = await import('@/services/thing-facts'); await beingPlaced(campaignId, { id: characterId, name: actor.name }, toRoom?.id ?? null, end); }
      broadcastEvent(campaignId, {
        kind: 'token_moved', entityId: characterId, entityType: 'character',
        x: end.x, y: end.y, placedAt, roomId: toRoom?.id ?? null, roomName: toRoom?.name ?? null,
        path: path.points, seconds, cause: opts.cause, ...seen,
      });
    } catch { /* the canvases will re-read */ }
  }

  // ENTERING A VEHICLE (finding 68 / #41): a walk that ends at a vehicle in the same room ends inside it.
  let boarded: string | undefined;
  if (target.kind === 'thing' && !path.blockedBy) {
    try {
      const it = await prisma.campaignItem.findUnique({ where: { id: target.itemId }, select: { id: true, name: true, data: true } });
      const itRoom = it ? (await thingStanding(map, it.id))?.room : null;
      if (it && itRoom && toRoom && itRoom.id === toRoom.id && isVehicle(JSON.parse(it.data ?? '{}'))) {
        await seatBeingIn(campaignId, characterId, { id: it.id, type: 'CAMPAIGN_ITEM' }, opts.cause);
        boarded = it.name;
      }
    } catch { /* the walk stands; boarding is owed */ }
  }

  const report: MoveReport = {
    ok: true, ...base, ...(boarded ? { boarded } : {}), to: end, feet: Math.round(path.feet * 10) / 10, seconds,
    toRoom: toRoom?.name ?? null, opened, path: path.points,
    ...(path.blockedBy ? { stoppedBy: path.blockedBy.name } : {}),
  };
  if (path.blockedBy && !moved) return { ...report, ok: false, reason: `the ${path.blockedBy.name} is locked` };
  return report;
}

export const walkInputSchema = z.object({
  /** A room, a door, a person or a thing, as the world names it. */
  to: z.string().min(1).max(200),
  pace: z.enum(['creep', 'walk', 'hurry', 'run']).optional(),
});

/** The Watcher (or ADMIN) walks a being somewhere by name: the route's entry. */
export async function walkCharacter(actorUserId: string, actorRole: string, characterId: string, input: z.infer<typeof walkInputSchema>): Promise<MoveReport> {
  const parsed = walkInputSchema.parse(input);
  const character = await prisma.character.findUnique({ where: { id: characterId }, include: { campaign: { select: { gmUserId: true } } } });
  if (!character || !character.campaignId) throw new NotFoundError('Character not found');
  if (!canEditCharacter(actorUserId, actorRole, character)) throw new ForbiddenError('Only the Watcher can walk a character');
  const resolved = await resolveMoveRef(character.campaignId, parsed.to, characterId);
  if (!resolved) throw new ValidationError(`nothing called "${parsed.to}" on the map`);
  return moveBeing(character.campaignId, characterId, resolved.target, { cause: 'gm', pace: parsed.pace });
}

/** One sentence the table can print for a walk. Pure. */
export function describeMove(name: string, r: MoveReport): string {
  if (!r.ok) return `${name} does not move: ${r.reason ?? 'no way'}.`;
  const bits: string[] = [];
  const out = r.gotOutOf ? `${name} gets out of the ${r.gotOutOf}. ` : '';
  if (r.boarded) bits.push(`gets into the ${r.boarded}`);
  if (r.opened.length) bits.push(`opens the ${r.opened.join(' and the ')}`);
  if (r.stoppedBy) bits.push(`stops at the ${r.stoppedBy} (locked)`);
  const where = r.toRoom && r.toRoom !== r.fromRoom ? ` into ${r.toRoom}` : '';
  const head = r.feet > 0 ? `${name} walks ${r.feet} ft${where} to ${r.label}` : `${name} is already at ${r.label}`;
  return `${out}${head}${bits.length ? ', ' + bits.join(', ') : ''}.`;
}

// ── Elsewhere (stretch 2026-10-31) ───────────────────────────────────────────
// A being's life is not all on the drawn map: the hotel, the pizza place, the
// street exist as facts and as undrawn Locations. Leaving the map is a walk to
// the nearest way off it (an opening whose far side is no drawn room: "stairs
// down", "outside"); coming back is appearing at the way onto it nearest where
// one is headed. Both are plain moves; nothing teleports into a room.

/** The exit portal nearest a point on the level; null when the level has no way off it drawn. */
function nearestExit(map: LevelMap, from: Point | null): Portal | null {
  const exits = exitPortals(map);
  if (!exits.length) return null;
  if (!from) return exits[0];
  const d = (p: Portal) => Math.hypot((p.a.x + p.b.x) / 2 - from.x, (p.a.y + p.b.y) / 2 - from.y);
  return exits.slice().sort((a, b) => d(a) - d(b))[0];
}

/** The drawn room an exit portal opens onto. */
function roomOfExit(map: LevelMap, p: Portal): RoomPoly | null {
  for (const b of p.between) { const r = roomByName(map, b); if (r) return r; }
  return roomAt(map, { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 });
}

export interface LeaveReport { ok: boolean; via?: string; feet: number; reason?: string }

/**
 * Walk to the nearest way off the level (the being is then filed elsewhere by the caller). A being already off the map
 * leaves nothing; a level with no way off it drawn refuses, so JEWL can see what the map lacks.
 */
export async function leaveMap(campaignId: string, characterId: string): Promise<LeaveReport> {
  const { map } = await loadWorldLevel(campaignId, await levelOfBeing(characterId));
  const standing = await beingStanding(map, characterId);
  if (!standing) return { ok: true, feet: 0 };
  const exit = nearestExit(map, standing.point);
  if (!exit) return { ok: false, feet: 0, reason: 'no way off the map is drawn (an opening to "outside" or "stairs down")' };
  const walk = await moveBeing(campaignId, characterId, { kind: 'portal', portalId: exit.id, homeId: exit.homeId }, { cause: 'sim', world: { map } });
  if (!walk.ok) return { ok: false, feet: 0, reason: walk.reason, via: exit.name };
  return { ok: true, via: exit.name, feet: walk.feet };
}

export interface ArriveReport { ok: boolean; via?: string; room?: string; reason?: string }

/**
 * Appear on the level at the way onto it nearest `toward` (a point, when known), filed in the room that way opens onto, the
 * token placed at the opening. The walk to the real target follows as an ordinary move.
 */
export async function arriveOnMap(campaignId: string, characterId: string, toward: Point | null, opts: { cause?: 'sim' | 'gm' | 'jewl'; level?: number | null } = {}): Promise<ArriveReport> {
  const { map } = await loadWorldLevel(campaignId, opts.level ?? null);
  const actor = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, campaignId: true, campaign: { select: { gmUserId: true } } } });
  if (!actor || actor.campaignId !== campaignId) return { ok: false, reason: 'not in this campaign' };
  const exit = nearestExit(map, toward);
  if (!exit) return { ok: false, reason: 'no way onto the map is drawn (an opening to "outside" or "stairs down")' };
  const room = roomOfExit(map, exit);
  if (!room) return { ok: false, reason: `the ${exit.name} opens onto no drawn room` };
  const at = spotAtPortal(map, exit, roomCentreOf(room));
  await moveCharacterToLocation(actor.campaign?.gmUserId ?? '', 'WATCHER', { characterId, locationId: room.id, broadcast: false });
  const placedAt = await stampBeingPoint(characterId, at);
  try {
    const seen = await perceiveMapChange(campaignId, { kind: 'being', entityId: characterId, at, roomId: room.id }, { map });
    const { beingPlaced } = await import('@/services/thing-facts');
    await beingPlaced(campaignId, { id: characterId, name: actor.name }, room.id, at);
    broadcastEvent(campaignId, { kind: 'token_moved', entityId: characterId, entityType: 'character', x: at.x, y: at.y, placedAt, roomId: room.id, roomName: room.name, cause: opts.cause ?? 'sim', ...seen });
  } catch { /* the canvases will re-read */ }
  return { ok: true, via: exit.name, room: room.name };
}

function roomCentreOf(room: RoomPoly): Point {
  const n = room.points.length || 1;
  return { x: room.points.reduce((s, p) => s + p.x, 0) / n, y: room.points.reduce((s, p) => s + p.y, 0) / n };
}

/** Where a drawn Location sits on the level, for "nearest way in": the centre of its footprint, or null when it is not drawn there. */
export function locationPointOn(map: LevelMap, locationId: string): Point | null {
  const r = map.rooms.find((x) => x.id === locationId) ?? map.homes?.find((x) => x.id === locationId) ?? null;
  return r ? roomCentreOf(r) : null;
}


// ── Driving (finding 68 / #41 vehicle travel, 2026-11-05) ───────────────────

/**
 * Where a vehicle comes to rest at a way in: the exit portal's midpoint pushed `distanceFt` (default 6) to the EXTERIOR side
 * (the side that lies in no drawn room). When both sides are outside every room, the side farther from `arrivalRoom`'s centre.
 * Pure.
 */
export function parkSpotOutside(map: LevelMap, exit: Portal, arrivalRoom?: RoomPoly | null, distanceFt = 6): Point {
  const mid = { x: (exit.a.x + exit.b.x) / 2, y: (exit.a.y + exit.b.y) / 2 };
  const dx = exit.b.x - exit.a.x, dy = exit.b.y - exit.a.y, L = Math.hypot(dx, dy) || 1;
  const n = { x: -dy / L, y: dx / L };
  const d = distanceFt * 20; // UNITS_PER_FT
  const sides = [1, -1].map((sg) => ({ x: mid.x + n.x * sg * d, y: mid.y + n.y * sg * d }));
  const inRoom = (p: Point) => !!roomAt(map, p) || !!map.homes?.some((h) => insideOrOn(p, h.points));
  const free = sides.filter((p) => !inRoom(p));
  if (free.length === 1) return free[0];
  const c = arrivalRoom ? roomCentreOf(arrivalRoom) : mid;
  return (free.length ? free : sides).slice().sort((a, b) => Math.hypot(b.x - c.x, b.y - c.y) - Math.hypot(a.x - c.x, a.y - c.y))[0];
}

export interface DriveReport { ok: boolean; reason?: string; riders: string[]; room?: string; via?: string }

/**
 * The vehicle travels to another LOCATION and everyone inside it goes along, still inside. A drawn destination: the car is filed
 * in the room the way in opens onto and parked just outside that way in. An undrawn one: filed there with no point. A vehicle
 * leaving a lot with no gate drawn goes anyway (the gate is data owed). The clock is whatever the line already charged.
 */
export async function driveVehicle(campaignId: string, vehicle: { id: string; name: string }, to: { id: string; name: string }, toLevel: number | null): Promise<DriveReport> {
  const item = await prisma.campaignItem.findUnique({ where: { id: vehicle.id }, select: { id: true, locationId: true } });
  if (!item) return { ok: false, reason: 'the vehicle is gone', riders: [] };
  try {
    const { levelOfLocation } = await import('@/services/spatial-world');
    const fromLevel = item.locationId ? await levelOfLocation(item.locationId) : null;
    if (fromLevel !== null) {
      const { map: origin } = await loadWorldLevel(campaignId, fromLevel);
      if (!exitPortals(origin).length) console.log(`[drive] ${vehicle.name} leaves a level with no gate drawn (${origin.rooms.map((r) => r.name).join(', ')}) - the gate is data owed (finding 68 / #41)`);
    }
  } catch { /* the drive does not wait on the origin's map */ }

  let roomId = to.id, roomName = to.name;
  let parkedAt: { exit: string; room: string } | null = null;
  let park: Point | null = null, frac: { x: number; y: number } | null = null, via: string | undefined;
  if (toLevel !== null) {
    const { map } = await loadWorldLevel(campaignId, toLevel);
    const exit = nearestExit(map, locationPointOn(map, to.id));
    const room = exit ? roomOfExit(map, exit) : (map.rooms.find((r) => r.id === to.id) ?? null);
    if (!exit || !room) return { ok: false, reason: `no way onto the map at ${to.name} is drawn (an opening to "outside")`, riders: [] };
    roomId = room.id; roomName = room.name; via = exit.name;
    const box = footprintBounds(room.points);
    frac = worldToFraction(parkSpotOutside(map, exit, room), box);
    park = fractionToWorld(frac, box); // what is stored is what the canvases and the riders see
    parkedAt = { exit: exit.name, room: room.name };
  }
  const positionAt = Date.now();
  await prisma.entityRelationship.deleteMany({ where: { sourceId: vehicle.id, sourceType: 'CAMPAIGN_ITEM', relationshipType: 'located_at', targetType: 'LOCATION' } });
  await prisma.entityRelationship.create({ data: { campaignId, sourceId: vehicle.id, sourceType: 'CAMPAIGN_ITEM', targetId: roomId, targetType: 'LOCATION', relationshipType: 'located_at', strength: 5, ...(frac ? { data: JSON.stringify({ position: frac, positionAt }) } : {}) } });
  await prisma.campaignItem.update({ where: { id: vehicle.id }, data: { locationId: roomId, holderId: null } });
  if (park) { try { broadcastEvent(campaignId, { kind: 'token_moved', entityId: vehicle.id, entityType: 'item', x: park.x, y: park.y, placedAt: positionAt, roomId, roomName, cause: 'sim' } as never); } catch { /* canvases re-read */ } }
  // FINDING 81 (2026-11-05): a token position is a 0..1 fraction of the room's footprint, so the spot outside the door is stored clamped to
  // the wall line at the door; the exterior side is said in the placement fact instead (the car is OUTSIDE the way in, not in the room).
  if (parkedAt) { const { thingParkedOutside } = await import('@/services/thing-facts'); await thingParkedOutside(campaignId, vehicle, parkedAt.exit, to.name); }
  const riders = await ridersOf(vehicle.id);
  for (const r of riders) {
    await seatBeingIn(campaignId, r.id, { id: vehicle.id, type: 'CAMPAIGN_ITEM' }, 'sim');
    if (!park) { const { clearBeingPoint } = await import('@/services/spatial-world'); await clearBeingPoint(r.id); }
  }
  return { ok: true, riders: riders.map((r) => r.name), room: roomName, via };
}
