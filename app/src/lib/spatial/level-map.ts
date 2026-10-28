/**
 * Level map — turns Locations (footprints + openings) and placed things
 * (map shapes) into rooms, walls cut by their openings, portals and
 * obstacles for one storey, plus the segment tests every other spatial
 * helper leans on. Pure; no I/O.
 */
import { parseFootprint, parseOpenings, pointInPolygon, footprintBounds } from '@/lib/canvas-geometry';
import type { Point, Rect } from '@/lib/canvas-geometry';
import { CELL_UNITS, UNITS_PER_FT } from './types';
import type { LevelMap, RoomPoly, Portal, WallSeg, Obstacle, Passability } from './types';

/** Distance tolerance (world units) for collinearity, touching and endpoint tests. */
export const TOL = 0.5;

// ── Scalar geometry ─────────────────────────────────────────────────────────

/** Absolute polygon area (shoelace). */
export function polygonArea(points: Point[]): number {
  let s = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Polygon centroid (area-weighted; vertex average when degenerate). */
export function polygonCentroid(points: Point[]): Point {
  let s = 0, cx = 0, cy = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i], b = points[(i + 1) % n];
    const w = a.x * b.y - b.x * a.y;
    s += w; cx += (a.x + b.x) * w; cy += (a.y + b.y) * w;
  }
  if (Math.abs(s) < 1e-9) {
    let x = 0, y = 0;
    for (const p of points) { x += p.x; y += p.y; }
    return { x: x / Math.max(1, n), y: y / Math.max(1, n) };
  }
  return { x: cx / (3 * s), y: cy / (3 * s) };
}

/** Distance from p to the segment ab. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** True when p lies on the segment ab within tol. */
export function pointOnSegment(p: Point, a: Point, b: Point, tol = TOL): boolean {
  return distToSegment(p, a, b) <= tol;
}

/** Which side of the line ab the point c lies on: +1 / −1, or 0 when within tol of the line. */
function orient(a: Point, b: Point, c: Point, tol = TOL): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-9) return 0;
  const d = (dx * (c.y - a.y) - dy * (c.x - a.x)) / L;
  return d > tol ? 1 : d < -tol ? -1 : 0;
}

/** Do segments ab and cd meet — properly, touching at an endpoint, or overlapping collinearly (within tol)? */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  if (pointOnSegment(a, c, d) || pointOnSegment(b, c, d) || pointOnSegment(c, a, b) || pointOnSegment(d, a, b)) return true;
  const d1 = orient(c, d, a), d2 = orient(c, d, b), d3 = orient(a, b, c), d4 = orient(a, b, d);
  return d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0 && d1 !== d2 && d3 !== d4;
}

/** Does the step from→to pass THROUGH the portal (endpoints strictly on opposite sides, meeting within its span)? */
export function crossesPortal(from: Point, to: Point, p: Portal): boolean {
  if (orient(p.a, p.b, from) * orient(p.a, p.b, to) >= 0) return false;
  return segmentsIntersect(from, to, p.a, p.b);
}

/** Quick reject: do the bounding boxes of ab and cd (grown by tol) overlap? */
function boxesOverlap(a: Point, b: Point, c: Point, d: Point): boolean {
  return Math.min(a.x, b.x) - TOL <= Math.max(c.x, d.x) && Math.max(a.x, b.x) + TOL >= Math.min(c.x, d.x)
    && Math.min(a.y, b.y) - TOL <= Math.max(c.y, d.y) && Math.max(a.y, b.y) + TOL >= Math.min(c.y, d.y);
}

/** Inside-or-on test that also accepts a point sitting exactly on an edge by probing ±0.01 around it. */
export function insideOrOn(p: Point, points: Point[]): boolean {
  if (pointInPolygon(p, points)) return true;
  const e = 0.01;
  return pointInPolygon({ x: p.x + e, y: p.y }, points) || pointInPolygon({ x: p.x - e, y: p.y }, points)
    || pointInPolygon({ x: p.x, y: p.y + e }, points) || pointInPolygon({ x: p.x, y: p.y - e }, points);
}

// ── Building ────────────────────────────────────────────────────────────────

/** Cut the part of a wall an opening covers (collinear overlap) — up to two remaining pieces. */
function cutWall(w: WallSeg, oa: Point, ob: Point): WallSeg[] {
  const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y;
  const L = Math.hypot(dx, dy);
  if (L < TOL) return [w];
  const lineDist = (p: Point) => Math.abs(dx * (p.y - w.a.y) - dy * (p.x - w.a.x)) / L;
  if (lineDist(oa) > TOL || lineDist(ob) > TOL) return [w];
  const ta = ((oa.x - w.a.x) * dx + (oa.y - w.a.y) * dy) / (L * L);
  const tb = ((ob.x - w.a.x) * dx + (ob.y - w.a.y) * dy) / (L * L);
  const lo = Math.max(0, Math.min(ta, tb)), hi = Math.min(1, Math.max(ta, tb));
  if ((hi - lo) * L <= TOL) return [w];
  const out: WallSeg[] = [];
  if (lo * L > TOL) out.push({ ...w, a: w.a, b: { x: w.a.x + lo * dx, y: w.a.y + lo * dy } });
  if ((1 - hi) * L > TOL) out.push({ ...w, a: { x: w.a.x + hi * dx, y: w.a.y + hi * dy }, b: w.b });
  return out;
}

export interface LevelMapInput {
  locations: Array<{ id: string; name: string; data: unknown }>;
  items?: Array<{ id: string; name: string; centre: Point; mapShapeFt?: { points: Point[] } | null }>;
  level?: number;
}

/**
 * Build the LevelMap for one storey: rooms (smallest first), walls cut by every
 * opening, portals, obstacles (things with a map shape, also furniture walls)
 * and the padded bounds. A footprint that wholly contains another footprint is
 * a home shell: its edges are walls but it is not a room.
 */
export function buildLevelMap(input: LevelMapInput): LevelMap {
  const level = input.level ?? 0;
  const parsed = input.locations.map(l => {
    const data = (l.data && typeof l.data === 'object' ? l.data : {}) as Record<string, unknown>;
    return { l, fp: parseFootprint(data.footprint), openings: parseOpenings(data.openings) };
  });
  const onLevel = parsed.filter(p => p.fp && p.fp.level === level) as Array<typeof parsed[number] & { fp: NonNullable<typeof parsed[number]['fp']> }>;
  const isShell = (p: typeof onLevel[number]) =>
    onLevel.some(q => q !== p && q.fp.points.every(pt => insideOrOn(pt, p.fp.points)));

  const rooms: RoomPoly[] = [];
  const homes: RoomPoly[] = [];
  let walls: WallSeg[] = [];
  const allPoints: Point[] = [];
  for (const p of onLevel) {
    const pts = p.fp.points;
    allPoints.push(...pts);
    for (let i = 0; i < pts.length; i++) walls.push({ a: pts[i], b: pts[(i + 1) % pts.length], ownerId: p.l.id, kind: 'wall' });
    (isShell(p) ? homes : rooms).push({ id: p.l.id, name: p.l.name, points: pts, level, area: polygonArea(pts) });
  }
  rooms.sort((a, b) => a.area - b.area);

  const portals: Portal[] = [];
  for (const p of parsed) {
    if (p.fp && p.fp.level !== level) continue;
    for (const o of p.openings) {
      walls = walls.flatMap(w => cutWall(w, o.a, o.b));
      portals.push({
        id: o.id, homeId: p.l.id, kind: o.kind, a: o.a, b: o.b, between: o.between,
        name: o.name ?? `${o.kind} between ${o.between.join(' and ')}`,
        ...(o.state ? { state: o.state } : {}),
      });
    }
  }

  const obstacles: Obstacle[] = [];
  for (const it of input.items ?? []) {
    const shape = it.mapShapeFt;
    if (!shape || shape.points.length < 3) continue;
    const pts = shape.points.map(q => ({ x: it.centre.x + q.x * UNITS_PER_FT, y: it.centre.y + q.y * UNITS_PER_FT }));
    obstacles.push({ id: it.id, name: it.name, points: pts });
    for (let i = 0; i < pts.length; i++) walls.push({ a: pts[i], b: pts[(i + 1) % pts.length], ownerId: it.id, kind: 'furniture' });
  }

  const b = footprintBounds(allPoints);
  const bounds: Rect = allPoints.length === 0
    ? { x: 0, y: 0, width: CELL_UNITS * 2, height: CELL_UNITS * 2 }
    : { x: b.x - CELL_UNITS, y: b.y - CELL_UNITS, width: b.width + 2 * CELL_UNITS, height: b.height + 2 * CELL_UNITS };
  return { level, rooms, walls, portals, obstacles, bounds, homes };
}

// ── Queries ─────────────────────────────────────────────────────────────────

/** What a portal lets through, by kind and door state. */
export function portalPassability(p: Portal): Passability {
  switch (p.kind) {
    case 'door':
      if (p.state === 'locked') return { move: false, opens: false, sight: false };
      if (p.state === 'open') return { move: true, opens: false, sight: true };
      return { move: true, opens: true, sight: false };
    case 'window':
      return { move: false, opens: false, sight: true };
    default:
      return { move: true, opens: false, sight: true };
  }
}

/** The smallest room containing p (a point on an edge counts as inside), or null. */
export function roomAt(map: LevelMap, p: Point): RoomPoly | null {
  for (const r of map.rooms) if (insideOrOn(p, r.points)) return r;
  return null;
}

/** A room by name, case-insensitive and trimmed. */
export function roomByName(map: LevelMap, name: string): RoomPoly | null {
  const key = name.trim().toLowerCase();
  return map.rooms.find(r => r.name.trim().toLowerCase() === key) ?? null;
}

/** Portals that name the room in `between` or whose midpoint sits on the room's boundary. */
export function portalsOfRoom(map: LevelMap, room: RoomPoly): Portal[] {
  const key = room.name.trim().toLowerCase();
  const n = room.points.length;
  return map.portals.filter(p => {
    if (p.between.some(s => s.trim().toLowerCase() === key)) return true;
    const mid = { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
    for (let i = 0; i < n; i++) if (distToSegment(mid, room.points[i], room.points[(i + 1) % n]) <= 1) return true;
    return false;
  });
}

export interface Blocking { blocked: boolean; portal?: Portal; opens?: Portal[] }

/** Like crossesBlocking, with `allow` letting named portals through regardless of state (internal, used by pathfinding). */
export function stepBlocking(map: LevelMap, from: Point, to: Point, mode: 'move' | 'sight', allow?: (p: Portal) => boolean): Blocking {
  for (const w of map.walls) {
    if (mode === 'sight' && w.kind === 'furniture') continue;
    if (!boxesOverlap(from, to, w.a, w.b)) continue;
    if (segmentsIntersect(from, to, w.a, w.b)) return { blocked: true };
  }
  const opens: Portal[] = [];
  for (const p of map.portals) {
    if (!boxesOverlap(from, to, p.a, p.b)) continue;
    if (!crossesPortal(from, to, p)) continue;
    const pass = portalPassability(p);
    if (!pass[mode] && !(allow && allow(p))) return { blocked: true, portal: p };
    if (mode === 'move' && pass.opens) opens.push(p);
  }
  return { blocked: false, opens };
}

/** Is a straight step from→to blocked for movement or sight? Reports the blocking portal, or the doors it would open. */
export function crossesBlocking(map: LevelMap, from: Point, to: Point, mode: 'move' | 'sight'): Blocking {
  return stepBlocking(map, from, to, mode);
}
