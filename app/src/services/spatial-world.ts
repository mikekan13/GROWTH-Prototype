/**
 * The world as the spatial engine sees it (2026-10-27, Mike: "pretty heavy
 * pathfinding, not just for movement of the tokens but also things like line
 * of sight"). Reads a campaign's map out of Prisma into a pure `LevelMap`
 * (lib/spatial) and answers WHERE a being or a thing stands in world units.
 *
 * Positions:
 *   - a being's point = `Character.data.canvasX/canvasY` (the footprint frame,
 *     20 units = 1 ft), written by the engine when it walks the being, by the
 *     GM's drag, and by JEWL's draw_place_map. When the point is missing or
 *     lies outside the being's room, the room's stand-spot is used.
 *   - a thing's point = its located_at edge's `data.position` (fractions of the
 *     room's footprint box), else the room's centre; a held thing is where its
 *     holder is.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { parseFootprint, parseTokenPosition, footprintBounds, fractionToWorld, type Point } from '@/lib/canvas-geometry';
import { buildLevelMap, roomAt, nearestWalkable, spotInRoom, insideOrOn, type LevelMap, type RoomPoly, type Portal } from '@/lib/spatial';
import { broadcastEvent } from '@/lib/campaign-stream';

const REL = 'located_at';

/** Area-weighted centroid of a polygon (falls back to the vertex mean for a degenerate one). Pure. */
export function polygonCentroid(points: Point[]): Point {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross; cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, points.length);
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

function parseData(raw: string | null | undefined): Record<string, unknown> {
  try { const d = raw ? JSON.parse(raw) : {}; return d && typeof d === 'object' && !Array.isArray(d) ? d as Record<string, unknown> : {}; } catch { return {}; }
}

export interface WorldLevel {
  map: LevelMap;
  /** Every Location of the campaign (id → name), rooms or not. */
  locationNames: Map<string, string>;
}

/** The story a Location is drawn on (its footprint's level); null when it has no footprint. */
export async function levelOfLocation(locationId: string | null | undefined): Promise<number | null> {
  if (!locationId) return null;
  const l = await prisma.location.findUnique({ where: { id: locationId }, select: { data: true } });
  const fp = l ? parseFootprint(parseData(l.data).footprint) : null;
  return fp ? fp.level : null;
}

/** The story a being stands on: its filed room's level. Null when it is nowhere drawn. */
export async function levelOfBeing(characterId: string): Promise<number | null> {
  return levelOfLocation(await roomIdOf(characterId));
}

/**
 * Build the campaign's map for one level. With no level given, the level most
 * of the drawn places are on (the apartment is on the fourth floor, 2026-10-27).
 * One read of locations, one of placed things.
 */
export async function loadWorldLevel(campaignId: string, level?: number | null): Promise<WorldLevel> {
  const locations = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } });
  const locationNames = new Map(locations.map((l) => [l.id, l.name]));
  const fpById = new Map(locations.map((l) => [l.id, parseFootprint(parseData(l.data).footprint)]));
  if (level == null) {
    const tally = new Map<number, number>();
    for (const fp of fpById.values()) if (fp) tally.set(fp.level, (tally.get(fp.level) ?? 0) + 1);
    level = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  }
  // Things on a room's floor with a drawn shape block the way (furniture).
  const items = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', holderId: null }, select: { id: true, name: true, data: true } });
  const shaped = items.filter((i) => { const d = parseData(i.data); return !!d.mapShape; });
  const edges = shaped.length
    ? await prisma.entityRelationship.findMany({ where: { sourceId: { in: shaped.map((i) => i.id) }, relationshipType: REL, targetType: 'LOCATION' }, select: { sourceId: true, targetId: true, data: true } })
    : [];
  const obstacles: Array<{ id: string; name: string; centre: Point; mapShapeFt: { points: Point[] } | null }> = [];
  for (const it of shaped) {
    const e = edges.find((x) => x.sourceId === it.id);
    const fp = e ? fpById.get(e.targetId) : null;
    if (!e || !fp) continue;
    const pos = parseTokenPosition(parseData(e.data).position);
    if (!pos) continue;
    const shape = parseData(it.data).mapShape as { points?: unknown } | undefined;
    const pts = Array.isArray(shape?.points) ? (shape!.points as Array<{ x: number; y: number }>).filter((p) => typeof p?.x === 'number' && typeof p?.y === 'number') : [];
    if (pts.length < 3) continue;
    obstacles.push({ id: it.id, name: it.name, centre: fractionToWorld(pos, footprintBounds(fp.points)), mapShapeFt: { points: pts } });
  }
  const map = buildLevelMap({ locations: locations.map((l) => ({ id: l.id, name: l.name, data: parseData(l.data) })), items: obstacles, level });
  return { map, locationNames };
}

/** The room (Location id) a being is filed in, by its located_at edge. */
export async function roomIdOf(entityId: string): Promise<string | null> {
  const e = await prisma.entityRelationship.findFirst({ where: { sourceId: entityId, relationshipType: REL, targetType: 'LOCATION' }, select: { targetId: true } });
  return e?.targetId ?? null;
}

/** A room's stand-spot when nothing better is known: its centroid, snapped to the walkable grid. */
export function roomCentre(map: LevelMap, room: RoomPoly): Point {
  const c = polygonCentroid(room.points);
  return nearestWalkable(map, c, 12) ?? c;
}

/**
 * The room a filed-at id stands for: the room itself, or — filed at a home shell (the apartment, not one of
 * its rooms; the 2026-10-28 finding: twelve things filed at the apartment stood "nowhere") — the room its
 * centre lies in, else its biggest room. Null when the id is no drawn place on this level.
 */
export function roomForFiled(map: LevelMap, filedId: string | null | undefined): RoomPoly | null {
  if (!filedId) return null;
  const room = map.rooms.find((r) => r.id === filedId);
  if (room) return room;
  const home = map.homes?.find((h) => h.id === filedId);
  if (!home) return null;
  const inside = map.rooms.filter((r) => insideOrOn(polygonCentroid(r.points), home.points));
  if (!inside.length) return null;
  return roomAt({ ...map, rooms: inside }, polygonCentroid(home.points)) ?? inside.reduce((a, b) => (b.area > a.area ? b : a));
}

export interface Standing {
  point: Point;
  room: RoomPoly | null;
  /** The point came from the being's own data (true) or was derived from its room (false). */
  stored: boolean;
}

/**
 * Where a being stands: its stored point when it lies inside its filed room
 * (or inside any room when it is filed nowhere); else the filed room's centre;
 * null when it is nowhere on the map.
 */
export async function beingStanding(map: LevelMap, characterId: string): Promise<Standing | null> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!c) return null;
  const d = parseData(c.data);
  const stored = typeof d.canvasX === 'number' && typeof d.canvasY === 'number' ? { x: d.canvasX, y: d.canvasY } : null;
  const filedId = await roomIdOf(characterId);
  const filed = roomForFiled(map, filedId);
  if (stored) {
    const at = roomAt(map, stored);
    if (at && (!filed || at.id === filed.id || containsRoom(map, filed, at))) return { point: stored, room: at, stored: true };
  }
  if (filed) return { point: roomCentre(map, filed), room: filed, stored: false };
  return null;
}

/** `outer` is the home that `inner` is drawn inside (a point in a room is also in its home). */
function containsRoom(map: LevelMap, outer: RoomPoly, inner: RoomPoly): boolean {
  if (outer.id === inner.id) return true;
  const c = polygonCentroid(inner.points);
  return outer.area > inner.area && roomAt({ ...map, rooms: [outer] }, c)?.id === outer.id;
}

/** Where a thing lies: on its holder when held; else its point in its room; else its room's centre. */
export async function thingStanding(map: LevelMap, itemId: string): Promise<Standing | null> {
  const it = await prisma.campaignItem.findUnique({ where: { id: itemId }, select: { holderId: true, locationId: true } });
  if (!it) return null;
  if (it.holderId) return beingStanding(map, it.holderId);
  const e = await prisma.entityRelationship.findFirst({ where: { sourceId: itemId, relationshipType: REL }, select: { targetId: true, targetType: true, data: true } });
  // Inside a container: where the container is.
  if (e && e.targetType !== 'LOCATION') return thingStanding(map, e.targetId);
  const roomId = e?.targetId ?? it.locationId;
  const room = roomForFiled(map, roomId);
  if (!room) return null;
  const pos = e ? parseTokenPosition(parseData(e.data).position) : null;
  if (pos) return { point: fractionToWorld(pos, footprintBounds(room.points)), room, stored: true };
  return { point: roomCentre(map, room), room, stored: false };
}

/**
 * Put a being inside a drawn room without walking (the Watcher narrated them
 * there, JEWL placed them): the room's stand-spot by the way in from where
 * they stood, written and broadcast as a `token_moved` with no path. False
 * when the room has no footprint on the map (the caller falls back).
 */
export async function placeBeingInRoom(campaignId: string, characterId: string, roomId: string, cause: 'sim' | 'gm' | 'jewl'): Promise<boolean> {
  const { map } = await loadWorldLevel(campaignId, await levelOfLocation(roomId));
  const room = map.rooms.find((r) => r.id === roomId);
  if (!room) return false;
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!c) return false;
  const d = parseData(c.data);
  const from = typeof d.canvasX === 'number' && typeof d.canvasY === 'number' ? { x: d.canvasX, y: d.canvasY } : roomCentre(map, room);
  const at = roomAt(map, from)?.id === room.id ? from : spotInRoom(map, room, from);
  const placedAt = await stampBeingPoint(characterId, at);
  try {
    // Fog of war (loaded late: spatial-perception reads this module).
    const { perceiveMapChange } = await import('@/services/spatial-perception');
    const seen = await perceiveMapChange(campaignId, { kind: 'being', entityId: characterId, at, roomId: room.id }, { map });
    broadcastEvent(campaignId, { kind: 'token_moved', entityId: characterId, entityType: 'character', x: at.x, y: at.y, placedAt, roomId: room.id, roomName: room.name, cause, ...seen });
  } catch { /* canvases re-read on their own */ }
  return true;
}

/** Stamp a being's point (and the time it was placed) on its data. */
export async function stampBeingPoint(characterId: string, p: Point): Promise<number> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!c) throw new Error('Character not found');
  const placedAt = Date.now();
  const d = parseData(c.data);
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify({ ...d, canvasX: Math.round(p.x * 100) / 100, canvasY: Math.round(p.y * 100) / 100, canvasPlacedAt: placedAt }) } });
  return placedAt;
}

/**
 * Take a being off the map (stretch 2026-10-31: it went ELSEWHERE — a place
 * that exists as facts, not as a drawn room). Its stored point is dropped so
 * `beingStanding` answers null until it comes back onto a drawn level; the
 * canvases are told to re-read.
 */
export async function clearBeingPoint(characterId: string): Promise<void> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!c) throw new Error('Character not found');
  const d = parseData(c.data);
  delete d.canvasX; delete d.canvasY;
  d.canvasPlacedAt = Date.now();
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(d) } });
}

/**
 * The ways on and off a level: openings whose far side names no drawn room on it ("stairs down", "outside", "the street").
 * A being arriving from elsewhere appears at one of these; one leaving walks to one. Pure over the map.
 */
export function exitPortals(map: LevelMap): Portal[] {
  const rooms = new Set([...map.rooms, ...(map.homes ?? [])].map((r) => r.name.trim().toLowerCase()));
  return map.portals.filter((p) => p.kind !== 'window' && p.between.some((b) => !rooms.has(b.trim().toLowerCase())));
}
