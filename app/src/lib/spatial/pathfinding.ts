/**
 * Pathfinding — 8-connected A* over the 1-ft nav grid, no corner cutting,
 * string-pulled into a short polyline; reports the portals crossed and, when
 * only a locked door stands in the way, where the mover stops. Pure.
 */
import type { Point } from '@/lib/canvas-geometry';
import { CELL_UNITS, UNITS_PER_FT } from './types';
import type { LevelMap, Pace, PathResult, Portal } from './types';
import { crossesPortal, stepBlocking } from './level-map';
import { DIRS, cellCentre, gridOf, neighbour, snapToWalkable, stepFree, walkableAt } from './nav-grid';
import type { NavGrid } from './nav-grid';

const SQRT2 = Math.SQRT2;
const DEFAULT_MAX_CELLS = 50_000;

/** Octile distance between two cells, in cell steps. */
function octile(g: NavGrid, a: number, b: number): number {
  const dx = Math.abs((a % g.cols) - (b % g.cols)), dy = Math.abs(Math.floor(a / g.cols) - Math.floor(b / g.cols));
  return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
}

/** Minimal binary min-heap of (key, value) pairs for A*'s open set. */
class Heap {
  private k: number[] = [];
  private v: number[] = [];
  get size(): number { return this.k.length; }
  push(key: number, val: number): void {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop(): number {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop() as number, lv = v.pop() as number;
    if (k.length > 0) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Can the mover step from cell i in direction d (walkable target, free step, and no corner cutting on diagonals)? */
function canStep(map: LevelMap, g: NavGrid, i: number, d: number, allow?: (p: Portal) => boolean): boolean {
  const j = neighbour(g, i, d);
  if (j < 0 || g.walkable[j] !== 1) return false;
  if (!stepFree(map, g, i, d, allow)) return false;
  if (d < 4) return true;
  const [dx, dy] = DIRS[d];
  const ox = DIRS.findIndex(v => v[0] === dx && v[1] === 0), oy = DIRS.findIndex(v => v[0] === 0 && v[1] === dy);
  const nx = neighbour(g, i, ox), ny = neighbour(g, i, oy);
  return nx >= 0 && ny >= 0 && g.walkable[nx] === 1 && g.walkable[ny] === 1 && stepFree(map, g, i, ox, allow) && stepFree(map, g, i, oy, allow);
}

/** A* from cell `start` to cell `goal`; the cell index path, or null. */
function astar(map: LevelMap, g: NavGrid, start: number, goal: number, allow: ((p: Portal) => boolean) | undefined, maxCells: number): number[] | null {
  if (start === goal) return [start];
  const n = g.cols * g.rows;
  const gScore = new Float64Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = new Heap();
  gScore[start] = 0;
  open.push(octile(g, start, goal), start);
  let popped = 0;
  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) {
      const path: number[] = [];
      for (let c = goal; c !== -1; c = cameFrom[c]) path.push(c);
      return path.reverse();
    }
    if (++popped > maxCells) return null;
    for (let d = 0; d < 8; d++) {
      if (!canStep(map, g, cur, d, allow)) continue;
      const j = neighbour(g, cur, d);
      if (closed[j]) continue;
      const tentative = gScore[cur] + (d < 4 ? 1 : SQRT2);
      if (tentative < gScore[j]) {
        gScore[j] = tentative;
        cameFrom[j] = cur;
        open.push(tentative + octile(g, j, goal), j);
      }
    }
  }
  return null;
}

/** Is the straight segment a→b free for movement and over walkable cells only (sampled every half cell)? */
function segmentClear(map: LevelMap, g: NavGrid, a: Point, b: Point, allow?: (p: Portal) => boolean): boolean {
  if (stepBlocking(map, a, b, 'move', allow).blocked) return false;
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(L / (CELL_UNITS / 2));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!walkableAt(g, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
  }
  return true;
}

/** Greedy string-pulling: keep a point only when the straight run to the next kept point is not clear. */
function smooth(map: LevelMap, g: NavGrid, pts: Point[], allow?: (p: Portal) => boolean): Point[] {
  if (pts.length <= 2) return pts;
  const out: Point[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !segmentClear(map, g, pts[i], pts[j], allow)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** The portals a polyline passes through, in order along it. */
function portalsCrossed(map: LevelMap, pts: Point[]): Portal[] {
  const out: Portal[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const hits: Array<{ p: Portal; t: number }> = [];
    for (const p of map.portals) {
      if (!crossesPortal(a, b, p)) continue;
      const mx = (p.a.x + p.b.x) / 2 - a.x, my = (p.a.y + p.b.y) / 2 - a.y;
      hits.push({ p, t: mx * (b.x - a.x) + my * (b.y - a.y) });
    }
    hits.sort((u, v) => u.t - v.t);
    for (const h of hits) if (out[out.length - 1]?.id !== h.p.id) out.push(h.p);
  }
  return out;
}

/** Polyline length in feet. */
function polylineFeet(pts: Point[]): number {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return L / UNITS_PER_FT;
}

/**
 * Find a walkable path from→to. Null when either end has no walkable cell
 * within 2 cells or nothing connects them; when only locked doors stand in
 * the way, the path up to the first locked door with `blockedBy` set.
 */
export function findPath(map: LevelMap, from: Point, to: Point, opts?: { ignorePortalIds?: string[]; maxCells?: number }): PathResult | null {
  const g = gridOf(map);
  const start = snapToWalkable(g, from, 2), goal = snapToWalkable(g, to, 2);
  if (start < 0 || goal < 0) return null;
  const ignore = new Set(opts?.ignorePortalIds ?? []);
  const maxCells = opts?.maxCells ?? DEFAULT_MAX_CELLS;
  const allowIgnored = ignore.size > 0 ? (p: Portal) => ignore.has(p.id) : undefined;
  const allowLocked = (p: Portal) => ignore.has(p.id) || (p.kind === 'door' && p.state === 'locked');

  let cells = astar(map, g, start, goal, allowIgnored, maxCells);
  let blockedBy: Portal | undefined;
  if (!cells) {
    const relaxed = astar(map, g, start, goal, allowLocked, maxCells);
    if (!relaxed) return null;
    let cut = relaxed.length;
    for (let i = 0; i + 1 < relaxed.length; i++) {
      const r = stepBlocking(map, cellCentre(g, relaxed[i]), cellCentre(g, relaxed[i + 1]), 'move', allowIgnored);
      if (r.blocked) { blockedBy = r.portal; cut = i + 1; break; }
    }
    cells = relaxed.slice(0, cut);
  }

  const near = (p: Point, i: number) => { const c = cellCentre(g, i); return Math.hypot(c.x - p.x, c.y - p.y) <= CELL_UNITS; };
  let pts = cells.map(i => cellCentre(g, i));
  const keepTo = !blockedBy && near(to, cells[cells.length - 1]);
  if (cells.length === 1) {
    pts = [near(from, cells[0]) ? from : pts[0]];
    if (keepTo && (to.x !== pts[0].x || to.y !== pts[0].y)) pts.push(to);
  } else {
    if (near(from, cells[0])) pts[0] = from;
    if (keepTo) pts[pts.length - 1] = to;
  }
  const points = smooth(map, g, pts, allowIgnored);
  return { points, feet: polylineFeet(points), portals: portalsCrossed(map, points), ...(blockedBy ? { blockedBy } : {}) };
}

/** Feet per second at each pace. */
export const PACE_FT_PER_S: Record<Pace, number> = { creep: 1.5, walk: 4, hurry: 6, run: 12 };

/** Whole seconds (rounded up, at least 1 when there is any distance) to cover `feet` at a pace. */
export function pathSeconds(feet: number, pace: Pace = 'walk'): number {
  if (!(feet > 0)) return 0;
  return Math.max(1, Math.ceil(feet / PACE_FT_PER_S[pace]));
}
