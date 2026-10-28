/**
 * Sight — line of sight, the visibility polygon (angular sweep) and which
 * rooms a point can see into. Walls and sight-blocking portals (closed or
 * locked doors) stop sight; furniture and windows do not. Pure.
 */
import type { Point } from '@/lib/canvas-geometry';
import type { LevelMap, RoomPoly } from './types';
import { crossesBlocking, polygonCentroid, portalPassability, roomAt } from './level-map';

interface Seg { a: Point; b: Point }

/** Can `from` see `to` (no wall or sight-blocking portal between them)? */
export function lineOfSight(map: LevelMap, from: Point, to: Point): boolean {
  return !crossesBlocking(map, from, to, 'sight').blocked;
}

/** Every segment that stops sight: room walls, closed/locked doors, and the map bounds as an outer wall. */
function sightSegments(map: LevelMap): Seg[] {
  const segs: Seg[] = [];
  for (const w of map.walls) if (w.kind === 'wall') segs.push({ a: w.a, b: w.b });
  for (const p of map.portals) if (!portalPassability(p).sight) segs.push({ a: p.a, b: p.b });
  const { x, y, width, height } = map.bounds;
  const c = [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
  for (let i = 0; i < 4; i++) segs.push({ a: c[i], b: c[(i + 1) % 4] });
  return segs;
}

/** Distance along a unit ray from `o` in direction `d` to the nearest segment, or Infinity. */
function rayHit(o: Point, d: Point, segs: Seg[]): number {
  let best = Infinity;
  for (const s of segs) {
    const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y;
    const denom = d.x * ey - d.y * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const fx = s.a.x - o.x, fy = s.a.y - o.y;
    const t = (fx * ey - fy * ex) / denom;
    const u = (fx * d.y - fy * d.x) / denom;
    if (t > 1e-9 && u >= -1e-6 && u <= 1 + 1e-6 && t < best) best = t;
  }
  return best;
}

/** The region visible from `from`: rays toward every blocker endpoint (±1e-4 rad) plus 32 evenly spaced ones, hit points sorted by angle. */
export function visibilityPolygon(map: LevelMap, from: Point, opts?: { maxRange?: number }): Point[] {
  const segs = sightSegments(map);
  const maxRange = opts?.maxRange ?? Infinity;
  const fallback = Math.hypot(map.bounds.width, map.bounds.height) * 2;
  const angles: number[] = [];
  const seen = new Set<string>();
  for (const s of segs) {
    for (const e of [s.a, s.b]) {
      const key = `${e.x},${e.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const th = Math.atan2(e.y - from.y, e.x - from.x);
      angles.push(th - 1e-4, th, th + 1e-4);
    }
  }
  for (let i = 0; i < 32; i++) angles.push(-Math.PI + (i / 32) * 2 * Math.PI);
  const hits: Array<{ th: number; p: Point }> = [];
  for (const th of angles) {
    const d = { x: Math.cos(th), y: Math.sin(th) };
    let t = rayHit(from, d, segs);
    if (!Number.isFinite(t)) t = Number.isFinite(maxRange) ? maxRange : fallback;
    t = Math.min(t, maxRange);
    hits.push({ th: Math.atan2(d.y, d.x), p: { x: from.x + d.x * t, y: from.y + d.y * t } });
  }
  hits.sort((u, v) => u.th - v.th);
  return hits.map(h => h.p);
}

/** Rooms `from` can see into: the one it stands in, plus any whose centroid or an (inset) vertex is in line of sight. */
export function visibleRooms(map: LevelMap, from: Point): RoomPoly[] {
  const standing = roomAt(map, from);
  const out: RoomPoly[] = [];
  for (const r of map.rooms) {
    if (standing && r.id === standing.id) { out.push(r); continue; }
    const c = polygonCentroid(r.points);
    if (lineOfSight(map, from, c)) { out.push(r); continue; }
    const seen = r.points.some(v => {
      const dx = c.x - v.x, dy = c.y - v.y, L = Math.hypot(dx, dy) || 1;
      return lineOfSight(map, from, { x: v.x + (dx / L) * 2, y: v.y + (dy / L) * 2 });
    });
    if (seen) out.push(r);
  }
  return out;
}
