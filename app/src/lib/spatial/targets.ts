/**
 * Targets — where a mover should end up: just inside a room, pressed against
 * a door on its own side, or beside a thing. Every answer is a walkable nav
 * cell centre nearest the ideal spot (or the caller's own point when it is
 * already there). Pure.
 */
import type { Point } from '@/lib/canvas-geometry';
import { pointInPolygon } from '@/lib/canvas-geometry';
import { CELL_UNITS, UNITS_PER_FT } from './types';
import type { LevelMap, Portal, RoomPoly } from './types';
import { insideOrOn, polygonCentroid, portalsOfRoom, roomAt } from './level-map';
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
  return nearestWalkable(map, ideal) ?? ideal;
}
