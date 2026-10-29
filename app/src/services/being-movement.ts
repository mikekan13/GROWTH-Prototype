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
import { findPath, pathSeconds, portalPassability, roomAt, roomByName, portalsOfRoom, spotInRoom, spotAtPortal, spotBeside, nearestWalkable, crossesBlocking, wayOutDoor, lockedFromMySide, type LevelMap, type Portal, type RoomPoly, type Pace } from '@/lib/spatial';
import { loadWorldLevel, beingStanding, thingStanding, stampBeingPoint, roomIdOf, levelOfBeing } from '@/services/spatial-world';
import { moveCharacterToLocation } from '@/services/character-location';
import { writeDoorState } from '@/services/door-state';
import { perceiveMapChange } from '@/services/spatial-perception';

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
  const things = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, name: true } });
  const thing = things.find((t) => norm(t.name) === r) ?? things.find((t) => r.includes(norm(t.name)));
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
  const actor = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, campaignId: true, campaign: { select: { gmUserId: true } } } });
  const empty = (label: string, reason: string): MoveReport => ({ ok: false, reason, label, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, feet: 0, seconds: 0, fromRoom: null, toRoom: null, opened: [], path: [] });
  if (!actor || actor.campaignId !== campaignId) return empty('?', 'not in this campaign');
  const standing = await beingStanding(map, characterId);
  if (!standing) return empty('?', `${actor.name} stands nowhere on the map`);
  const dest = await destinationFor(map, target, standing.point);
  if (!dest) return empty('?', 'the target is nowhere on the map');
  const from = standing.point;
  const fromRoom = standing.room;
  const base = { label: dest.label, from, fromRoom: fromRoom?.name ?? null };

  // A LOCK IS WORKED FROM THE INSIDE (HW10 2026-10-29): a locked door that leaves the home the walker stands in is a closed
  // door to her — the way is found as if it were, and it is unlocked and opened on the way.
  const mine = map.portals.filter((p) => lockedFromMySide(map, p, from));
  const walkMap: LevelMap = mine.length ? { ...map, portals: map.portals.map((p) => (mine.some((m) => m.id === p.id && m.homeId === p.homeId) ? { ...p, state: 'closed' as const } : p)) } : map;
  // Other beings on the level are stepped around when there is room (soft, never a wall).
  const path = findPath(walkMap, from, dest.point, { avoid: await othersStanding(campaignId, characterId, map) });
  if (!path) return { ...empty(dest.label, `no way from ${fromRoom?.name ?? 'here'} to ${dest.label}`), ...base };

  // Doors the walker passes: a closed one is opened on the way (the one writer tells the facts and the canvases).
  const opened: string[] = [];
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
  const seconds = moved ? pathSeconds(path.feet, opts.pace ?? 'walk') : 0;

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

  const report: MoveReport = {
    ok: true, ...base, to: end, feet: Math.round(path.feet * 10) / 10, seconds,
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
  if (r.opened.length) bits.push(`opens the ${r.opened.join(' and the ')}`);
  if (r.stoppedBy) bits.push(`stops at the ${r.stoppedBy} (locked)`);
  const where = r.toRoom && r.toRoom !== r.fromRoom ? ` into ${r.toRoom}` : '';
  const head = r.feet > 0 ? `${name} walks ${r.feet} ft${where} to ${r.label}` : `${name} is already at ${r.label}`;
  return `${head}${bits.length ? ', ' + bits.join(', ') : ''}.`;
}
