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
import type { Point } from '@/lib/canvas-geometry';
import { lineOfSight, roomAt, portalsOfRoom, type LevelMap, type RoomPoly, type Portal } from '@/lib/spatial';
import type { PerceivedBy, PerceptionGrade } from '@/types/campaign-events';
import { loadWorldLevel, beingStanding, roomCentre, levelOfLocation, type Standing } from '@/services/spatial-world';

/** A change on the map, as the grader sees it. */
export type MapChange =
  | { kind: 'being' | 'thing'; entityId: string; at: Point; roomId: string | null; path?: Point[] }
  | { kind: 'door'; portalId: string; homeId: string };

export interface PerceivedChange {
  perceivedBy: PerceivedBy;
  /** Where a room-grade viewer's token goes: the room's centre (beings and things only). */
  roomPoint?: Point;
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
    for (const id of await viewersOf(campaignId)) {
      if (change.kind !== 'door' && id === change.entityId) { perceivedBy[id] = 'point'; continue; }
      const standing = await beingStanding(map, id);
      perceivedBy[id] = change.kind === 'door' ? gradeDoor(map, standing, portal!) : gradeMove(map, standing, change);
    }
    if (change.kind === 'door') return { perceivedBy };
    const room = change.roomId ? map.rooms.find((r) => r.id === change.roomId) ?? roomAt(map, change.at) : roomAt(map, change.at);
    return { perceivedBy, ...(room ? { roomPoint: roomCentre(map, room) } : {}) };
  } catch (err) {
    console.warn('[spatial-perception] map change ungraded (everyone sees)', err instanceof Error ? err.message : err);
    return undefined;
  }
}
