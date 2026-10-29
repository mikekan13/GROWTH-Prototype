/**
 * Targets — where a mover should end up: just inside a room, pressed against
 * a door on its own side, or beside a thing. Every answer is a walkable nav
 * cell centre nearest the ideal spot (or the caller's own point when it is
 * already there). Pure.
 */
import type { Point } from '@/lib/canvas-geometry';
import { pointInPolygon } from '@/lib/canvas-geometry';
import { CELL_UNITS, UNITS_PER_FT } from './types';

/** The map's square (GRID_FT = 5 ft): a being's token sits in one. */
const SQUARE_UNITS = 5 * UNITS_PER_FT;
/** The centre of the 5-ft square containing p. Pure. */
export function squareCentre(p: Point): Point {
  return { x: Math.floor(p.x / SQUARE_UNITS) * SQUARE_UNITS + SQUARE_UNITS / 2, y: Math.floor(p.y / SQUARE_UNITS) * SQUARE_UNITS + SQUARE_UNITS / 2 };
}
/** A square centre a token can stand on: strictly inside the room, in no obstacle, on a walkable cell. */
function standableSquare(map: LevelMap, p: Point, room: RoomPoly | null): Point | null {
  const c = squareCentre(p);
  if (room && !pointInPolygon(c, room.points)) return null;
  if (!room && !roomAt(map, c)) return null;
  if (map.obstacles.some((o) => pointInPolygon(c, o.points))) return null;
  // The nav grid is anchored to the map's bounds, so a square centre is rarely a cell centre: a walkable cell within one
  // cell of it is enough — the token stands at the square's centre.
  return nearestWalkable(map, c, 1) ? c : null;
}
import type { LevelMap, Portal, RoomPoly } from './types';
import { insideOrOn, polygonCentroid, portalsOfRoom, roomAt, roomByName } from './level-map';
import { cellCentre, cellIndex, cellXY, gridOf, snapToWalkable } from './nav-grid';

/** The walkable cell centre nearest p within maxCells, or null. */
export function nearestWalkable(map: LevelMap, p: Point, maxCells = 6): Point | null {
  const g = gridOf(map);
  const i = snapToWalkable(g, p, maxCells);
  return i < 0 ? null : cellCentre(g, i);
}

/** The walkable cell centre nearest p that lies in `room`, or null. */
function nearestWalkableIn(map: LevelMap, p: Point, room: RoomPoly, maxCells = 6): Point | null {
  const g = gridOf(map);
  const { cx, cy } = cellXY(g, p);
  let best: Point | null = null, bestD = Infinity;
  for (let y = cy - maxCells; y <= cy + maxCells; y++) {
    for (let x = cx - maxCells; x <= cx + maxCells; x++) {
      const i = cellIndex(g, x, y);
      if (i < 0 || g.walkable[i] !== 1) continue;
      const c = cellCentre(g, i);
      if (roomAt(map, c)?.id !== room.id) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) { bestD = d; best = c; }
    }
  }
  return best;
}

/** Midpoint and unit normal of a portal. */
function portalFrame(p: Portal): { mid: Point; n: Point } {
  const mid = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
  const dx = p.b.x - p.a.x, dy = p.b.y - p.a.y, L = Math.hypot(dx, dy) || 1;
  return { mid, n: { x: -dy / L, y: dx / L } };
}

/** Where to stand once inside a room: `from` if already there, else just inside the nearest portal, else near the centroid. */
export function spotInRoom(map: LevelMap, room: RoomPoly, from: Point): Point {
  if (roomAt(map, from)?.id === room.id) return from;
  const portals = portalsOfRoom(map, room);
  let best: Portal | null = null, bestD = Infinity;
  for (const p of portals) {
    const { mid } = portalFrame(p);
    const d = Math.hypot(mid.x - from.x, mid.y - from.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  if (best) {
    const { mid, n } = portalFrame(best);
    // GRID SNAP (HW11 2026-10-29, Mike: "we need some grid snapping in place"): the square just inside the door.
    for (const sign of [1, -1]) {
      const sq = standableSquare(map, { x: mid.x + n.x * sign * SQUARE_UNITS / 2, y: mid.y + n.y * sign * SQUARE_UNITS / 2 }, room);
      if (sq) return sq;
    }
    for (const push of [1.5, 1, 0.5]) {
      for (const sign of [1, -1]) {
        const ideal = { x: mid.x + n.x * sign * push * CELL_UNITS, y: mid.y + n.y * sign * push * CELL_UNITS };
        if (!insideOrOn(ideal, room.points)) continue;
        const spot = nearestWalkableIn(map, ideal, room);
        if (spot) return spot;
      }
    }
  }
  const c = polygonCentroid(room.points);
  return nearestWalkableIn(map, c, room) ?? nearestWalkable(map, c) ?? c;
}

/** The cell one step from a portal's midpoint on `from`'s side (same room as `from`, else the nearer side). */
export function spotAtPortal(map: LevelMap, portal: Portal, from: Point): Point {
  const { mid, n } = portalFrame(portal);
  const fromRoom = roomAt(map, from);
  // GRID SNAP (HW11 2026-10-29): the walker stands in the 5-ft square beside the door, on its own side — a cell (1 ft) off
  // the wall put the round token into the door. Falls back to the cell when no square fits.
  const squares = [1, -1].map((sign) => ({ sign, p: { x: mid.x + n.x * sign * SQUARE_UNITS / 2, y: mid.y + n.y * sign * SQUARE_UNITS / 2 } }));
  const own = fromRoom ? squares.find((s) => roomAt(map, s.p)?.id === fromRoom.id) : undefined;
  const bySide = own ?? squares.sort((a, b) => Math.hypot(a.p.x - from.x, a.p.y - from.y) - Math.hypot(b.p.x - from.x, b.p.y - from.y))[0];
  const snapped = standableSquare(map, bySide.p, roomAt(map, bySide.p));
  if (snapped) return snapped;
  const sides = [1, -1].map(sign => ({ x: mid.x + n.x * sign * CELL_UNITS, y: mid.y + n.y * sign * CELL_UNITS }));
  let pick = fromRoom ? sides.find(s => roomAt(map, s)?.id === fromRoom.id) : undefined;
  if (!pick) {
    const d = sides.map(s => Math.hypot(s.x - from.x, s.y - from.y));
    pick = d[0] <= d[1] ? sides[0] : sides[1];
  }
  const room = roomAt(map, pick);
  return (room ? nearestWalkableIn(map, pick, room) : null) ?? nearestWalkable(map, pick) ?? pick;
}

/** A spot about distanceFt (default 2.5) from `target` on `from`'s side, stepped outward until it is clear of any obstacle. */
export function spotBeside(map: LevelMap, target: Point, from: Point, opts?: { distanceFt?: number }): Point {
  const dist = (opts?.distanceFt ?? 2.5) * UNITS_PER_FT;
  const dx = from.x - target.x, dy = from.y - target.y, L = Math.hypot(dx, dy);
  const u = L > 1e-9 ? { x: dx / L, y: dy / L } : { x: 0, y: -1 };
  let ideal = { x: target.x + u.x * dist, y: target.y + u.y * dist };
  for (let k = 0; k < 20 && map.obstacles.some(o => pointInPolygon(ideal, o.points)); k++) {
    ideal = { x: ideal.x + u.x * CELL_UNITS / 2, y: ideal.y + u.y * CELL_UNITS / 2 };
  }
  // GRID SNAP (HW11): the square the ideal spot falls in, when a token can stand there and it is not the target's own square.
  const sq = standableSquare(map, ideal, roomAt(map, ideal));
  if (sq && !(Math.abs(sq.x - squareCentre(target).x) < 1e-6 && Math.abs(sq.y - squareCentre(target).y) < 1e-6)) return sq;
  return nearestWalkable(map, ideal) ?? ideal;
}

const lower = (s: string) => s.trim().toLowerCase().replace(/^(the|a|an)\s+/, '');

/**
 * "The door", unnamed, from a room with several doors (HW10 2026-10-29: Violet, "her back against the wall beside the
 * door" with Kristopher behind the entry door, was walked to the bathroom door — the nearer one). The door a being means
 * when it names none is the way OUT: the room's door that leaves the home, else the room's door on the fewest-doors way
 * to a room that has one, and only when no way out is drawn the nearest. One door: that door. Pure.
 */
export function wayOutDoor(map: LevelMap, here: RoomPoly, from: Point | null): Portal | null {
  const isDoor = (p: Portal) => p.kind === 'door';
  const mine = portalsOfRoom(map, here).filter(isDoor);
  if (!mine.length) return null;
  if (mine.length === 1) return mine[0];
  const home = map.homes?.find((h) => pointInPolygon(polygonCentroid(here.points), h.points)) ?? null;
  const inHome = (name: string): boolean => {
    const r = roomByName(map, name);
    if (!r) return false;
    return home ? pointInPolygon(polygonCentroid(r.points), home.points) : true;
  };
  const other = (p: Portal, of: string) => p.between.map(lower).find((b) => b !== lower(of)) ?? null;
  const leavesHome = (p: Portal, of: string) => { const o = other(p, of); return !!o && !inHome(o); };
  const out = mine.find((p) => leavesHome(p, here.name));
  if (out) return out;
  // Rooms with a door out of the home, then the fewest doors from each room to one of them.
  const doors = map.portals.filter(isDoor);
  const dist = new Map<string, number>();
  const queue: string[] = [];
  for (const r of map.rooms) {
    const name = lower(r.name);
    if (inHome(r.name) && portalsOfRoom(map, r).filter(isDoor).some((p) => leavesHome(p, r.name))) { dist.set(name, 0); queue.push(name); }
  }
  while (queue.length) {
    const n = queue.shift()!;
    for (const p of doors) {
      if (!p.between.some((b) => lower(b) === n)) continue;
      const o = other(p, n);
      if (o && !dist.has(o)) { dist.set(o, (dist.get(n) ?? 0) + 1); queue.push(o); }
    }
  }
  let best: Portal | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of mine) {
    const o = other(p, here.name);
    const d = o ? dist.get(o) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
    if (d < bestD) { best = p; bestD = d; }
  }
  if (best) return best;
  if (!from) return null;
  const mid = (p: Portal) => ({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 });
  const d2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  return mine.reduce((a, p) => (d2(from, mid(p)) < d2(from, mid(a)) ? p : a));
}

/**
 * A LOCK IS WORKED FROM THE INSIDE (HW10 2026-10-29: Violet, inside her own apartment, walked toward her entry door and
 * the world said "tries the Entry door; it is locked and does not give"). A locked door that LEAVES a home is, to the one
 * standing inside that home, a closed door: her hand is on the deadbolt. From outside it is locked. A locked door between
 * two rooms of the same home keeps its lock for both sides (who holds that key is not drawn). Pure.
 */
export function lockedFromMySide(map: LevelMap, p: Portal, from: Point): boolean {
  if (p.kind !== 'door' || p.state !== 'locked') return false;
  const home = map.homes?.find((h) => h.id === p.homeId) ?? null;
  if (!home || !pointInPolygon(from, home.points)) return false;
  return p.between.some((b) => { const r = roomByName(map, b); return !r || !pointInPolygon(polygonCentroid(r.points), home.points); });
}
