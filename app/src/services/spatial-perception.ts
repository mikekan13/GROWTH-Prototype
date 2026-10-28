/**
 * Fog of war on the map (Mike 2026-10-28): "Sight is just one sense that gives them perception … a sort of
 * last known, but it could also update because of sound etc."
 *
 * Before a map change is broadcast, this grades what every character of the campaign perceived of it:
 *   point — they SAW it (a straight ray on the real walls and doors reaches the spot);
 *   room  — they HEARD or FELT it (the same room, or a room joined to theirs by an opening — even a shut
 *           door carries footsteps and a latch): they know which room, not the spot;
 *   none  — nothing reached them; their map keeps the last known.
 * The delivery filter (lib/campaign-stream deliveryFor) degrades each Trailblazer's copy of the event by
 * their grade. The Watcher reads the truth record and is never graded.
 *
 * Hearing is a room rule today (adjacency through any opening), as the feed's `voiceCarries` is; distance
 * and walls thinning the sound come later. Never throws: an unreadable map grades nobody (everyone sees).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import type { Point, DoorState } from '@/lib/canvas-geometry';
import { lineOfSight, roomAt, portalsOfRoom, insideOrOn, type LevelMap, type RoomPoly, type Portal } from '@/lib/spatial';
import type { PerceivedBy, PerceptionGrade } from '@/types/campaign-events';
import { loadWorldLevel, beingStanding, thingStanding, roomCentre, levelOfLocation, type Standing } from '@/services/spatial-world';
import { recordPerceived } from '@/services/last-known';
import { broadcastEvent } from '@/lib/campaign-stream';

/**
 * A being that just moved looks around from where it now stands: every other being, unheld thing and door on
 * the level is graded from its new point, its last-known rows are refreshed, and what it now perceives is sent
 * to its own canvas as ordinary map events graded for it alone (other perceived viewers get nothing; the
 * truth record gets a no-op). Never throws.
 */
export async function lookAround(campaignId: string, viewerId: string, map: LevelMap, at: Point): Promise<void> {
  try {
    const viewer: Standing = { point: at, room: roomAt(map, at), stored: true };
    // Looking around is SIGHT: a still being, a thing on a shelf or a shut door in the next room makes no sound.
    // What is only heard reaches a viewer when it moves (perceiveMapChange grades the change).
    let unplaced = false;
    const others = await prisma.character.findMany({ where: { campaignId, status: { notIn: ['DEAD', 'RETIRED'] }, id: { not: viewerId } }, select: { id: true } });
    for (const o of others) {
      const s = await beingStanding(map, o.id);
      if (!s || !lineOfSight(map, viewer.point, s.point)) continue;
      const changed = await recordPerceived(campaignId, { subjectId: o.id, kind: 'being', at: s.stored ? s.point : undefined, roomId: s.room?.id ?? null }, { [viewerId]: 'point' });
      if (!changed.has(viewerId)) continue;
      if (s.stored) broadcastEvent(campaignId, { kind: 'token_moved', entityId: o.id, entityType: 'character', x: s.point.x, y: s.point.y, placedAt: Date.now(), roomId: s.room?.id ?? null, roomName: s.room?.name ?? null, cause: 'sim', perceivedBy: { [viewerId]: 'point' } });
      else unplaced = true;
    }
    const things = await prisma.campaignItem.findMany({ where: { campaignId, holderId: null, locationId: { not: null } }, select: { id: true } });
    for (const t of things) {
      const s = await thingStanding(map, t.id);
      if (!s || !lineOfSight(map, viewer.point, s.point)) continue;
      const changed = await recordPerceived(campaignId, { subjectId: t.id, kind: 'thing', at: s.stored ? s.point : undefined, roomId: s.room?.id ?? null }, { [viewerId]: 'point' });
      if (!changed.has(viewerId)) continue;
      if (s.stored) broadcastEvent(campaignId, { kind: 'token_moved', entityId: t.id, entityType: 'item', x: s.point.x, y: s.point.y, placedAt: Date.now(), roomId: s.room?.id ?? null, roomName: s.room?.name ?? null, cause: 'sim', perceivedBy: { [viewerId]: 'point' } });
      else unplaced = true;
    }
    // Something newly seen has no point of its own (laid out by the canvas): the viewer's canvas re-reads its model.
    if (unplaced) broadcastEvent(campaignId, { kind: 'map_changed', locationIds: [], characterIds: [viewerId] });
    for (const p of map.portals) {
      if (!p.state) continue;
      const grade = gradeDoor(map, viewer, p);
      if (grade !== 'point') continue;
      const state = visibleDoorState(map, viewer, p);
      const changed = await recordPerceived(campaignId, { subjectId: p.id, kind: 'door', state }, { [viewerId]: grade });
      if (changed.has(viewerId)) broadcastEvent(campaignId, { kind: 'door_changed', locationId: p.homeId, openingId: p.id, state: p.state, name: p.name, perceivedBy: { [viewerId]: grade }, visibleState: { [viewerId]: state } });
    }
  } catch (err) { console.warn('[spatial-perception] look around failed', err instanceof Error ? err.message : err); }
}

/** A change on the map, as the grader sees it. */
export type MapChange =
  | { kind: 'being' | 'thing'; entityId: string; at: Point; roomId: string | null; path?: Point[]; /** False when `at` is a room-centre stand-in, not the subject's own point. */ stored?: boolean }
  | { kind: 'door'; portalId: string; homeId: string };

export interface PerceivedChange {
  perceivedBy: PerceivedBy;
  /** Where a room-grade viewer's token goes: the room's centre (beings and things only). */
  roomPoint?: Point;
  /** Doors: the state each perceiving viewer can see (locked reads closed from outside the home). */
  visibleState?: Record<string, DoorState>;
}

const sameRoom = (a: RoomPoly | null, b: RoomPoly | null) => !!a && !!b && a.id === b.id;

/** Rooms joined to `room` by any opening, whatever its state: sound carries where sight may not. */
export function roomsJoinedTo(map: LevelMap, room: RoomPoly): RoomPoly[] {
  const portals = portalsOfRoom(map, room);
  const out: RoomPoly[] = [];
  for (const r of map.rooms) {
    if (r.id === room.id) continue;
    const key = r.name.trim().toLowerCase();
    const joined = portals.some((p) => p.between.some((s) => s.trim().toLowerCase() === key) || portalsOfRoom(map, r).some((q) => q.id === p.id));
    if (joined) out.push(r);
  }
  return out;
}

/** The grade one viewer gets for a being's or thing's move (pure). */
export function gradeMove(map: LevelMap, viewer: Standing | null, change: Extract<MapChange, { kind: 'being' | 'thing' }>): PerceptionGrade {
  if (!viewer) return 'none';
  if (lineOfSight(map, viewer.point, change.at)) return 'point';
  const room = change.roomId ? map.rooms.find((r) => r.id === change.roomId) ?? roomAt(map, change.at) : roomAt(map, change.at);
  // A glimpse on the way (past an open doorway) tells the viewer which way they went, not where they stopped.
  if (change.path?.some((p) => lineOfSight(map, viewer.point, p))) return 'room';
  if (!room || !viewer.room) return 'none';
  if (sameRoom(room, viewer.room)) return 'room';
  return roomsJoinedTo(map, viewer.room).some((r) => r.id === room.id) ? 'room' : 'none';
}

/**
 * The door's state as one viewer can know it (pure): a locked door looks merely closed from outside the home
 * that carries it (HW8 run 7: Kristopher cannot know Violet's door is locked); from inside, the bolt shows.
 */
export function visibleDoorState(map: LevelMap, viewer: Standing | null, portal: Portal): DoorState {
  const state = portal.state ?? 'open';
  if (state !== 'locked' || !viewer) return state;
  const home = map.homes?.find((h) => h.id === portal.homeId);
  return home && insideOrOn(viewer.point, home.points) ? 'locked' : 'closed';
}

/** The grade one viewer gets for a door changing state (pure): seen at its midpoint, or heard from either side. */
export function gradeDoor(map: LevelMap, viewer: Standing | null, portal: Portal): PerceptionGrade {
  if (!viewer) return 'none';
  const mid = { x: (portal.a.x + portal.b.x) / 2, y: (portal.a.y + portal.b.y) / 2 };
  if (lineOfSight(map, viewer.point, mid)) return 'point';
  if (!viewer.room) return 'none';
  return portalsOfRoom(map, viewer.room).some((p) => p.id === portal.id) ? 'room' : 'none';
}

/** The characters whose perception the map is drawn for: every being of the campaign still in play. */
async function viewersOf(campaignId: string): Promise<string[]> {
  const rows = await prisma.character.findMany({ where: { campaignId, status: { notIn: ['DEAD', 'RETIRED'] } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Grade every being of the campaign on a map change. `map` saves a reload when the caller holds the level
 * already; otherwise the change's level is read from its room. Returns undefined when there is no drawn map
 * (nothing to perceive by — everyone sees) or anything fails.
 */
export async function perceiveMapChange(campaignId: string, change: MapChange, opts: { map?: LevelMap } = {}): Promise<PerceivedChange | undefined> {
  try {
    let map = opts.map;
    let portal: Portal | undefined;
    if (!map) {
      const level = await levelOfLocation(change.kind === 'door' ? change.homeId : change.roomId);
      map = (await loadWorldLevel(campaignId, level)).map;
    }
    if (!map.rooms.length) return undefined;
    if (change.kind === 'door') {
      portal = map.portals.find((p) => p.id === change.portalId);
      if (!portal) return undefined;
    }
    const perceivedBy: PerceivedBy = {};
    const visibleState: Record<string, DoorState> = {};
    for (const id of await viewersOf(campaignId)) {
      if (change.kind !== 'door' && id === change.entityId) { perceivedBy[id] = 'point'; continue; }
      const standing = await beingStanding(map, id);
      if (change.kind === 'door') {
        perceivedBy[id] = gradeDoor(map, standing, portal!);
        if (perceivedBy[id] !== 'none') visibleState[id] = visibleDoorState(map, standing, portal!);
      } else perceivedBy[id] = gradeMove(map, standing, change);
    }
    if (change.kind === 'door') {
      // Each viewer's last known is the state as THEY can see it (locked reads closed from outside).
      for (const [id, state] of Object.entries(visibleState)) await recordPerceived(campaignId, { subjectId: portal!.id, kind: 'door', state }, { [id]: perceivedBy[id] });
      return { perceivedBy, visibleState };
    }
    const room = change.roomId ? map.rooms.find((r) => r.id === change.roomId) ?? roomAt(map, change.at) : roomAt(map, change.at);
    const roomPoint = room ? roomCentre(map, room) : undefined;
    await recordPerceived(campaignId, { subjectId: change.entityId, kind: change.kind, at: change.stored === false ? undefined : change.at, roomPoint, roomId: room?.id ?? change.roomId }, perceivedBy);
    // A being that moved looks around from where it now stands.
    if (change.kind === 'being') await lookAround(campaignId, change.entityId, map, change.at);
    return { perceivedBy, ...(roomPoint ? { roomPoint } : {}) };
  } catch (err) {
    console.warn('[spatial-perception] map change ungraded (everyone sees)', err instanceof Error ? err.message : err);
    return undefined;
  }
}
