/**
 * Nav grid — 1-ft cells over a LevelMap's bounds with walkable flags and a
 * lazily filled cache of step states between neighbouring cells. Internal
 * to the spatial module (pathfinding + targets). Pure; the cache is keyed
 * by map identity and invalidated when the map's portals/walls change.
 */
import type { Point } from '@/lib/canvas-geometry';
import { pointInPolygon } from '@/lib/canvas-geometry';
import { CELL_UNITS } from './types';
import type { LevelMap, Portal } from './types';
import { roomAt, stepBlocking } from './level-map';

/** Cell centres sit at 5 mod 10 world units so they never land on a half-grid wall line (walls snap to multiples of 50). */
const GRID_SHIFT = 5;

export interface NavGrid {
  originX: number; originY: number; cols: number; rows: number;
  walkable: Uint8Array;
  /** Per cell × 8 directions: 0 unknown, 1 free, 2 wall, 3 portal (index in stepPortal). */
  step: Int8Array;
  stepPortal: Int16Array;
  sig: string;
}

/** The 8 neighbour directions; the first four are orthogonal. */
export const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

const cache = new WeakMap<LevelMap, NavGrid>();

/** A cheap signature of what the step cache depends on. */
function signature(map: LevelMap): string {
  return `${map.walls.length}|${map.obstacles.length}|${map.portals.map(p => `${p.id}:${p.state ?? ''}`).join(',')}`;
}

/** The nav grid for a map, built once and reused while the map is unchanged. */
export function gridOf(map: LevelMap): NavGrid {
  const sig = signature(map);
  const hit = cache.get(map);
  if (hit && hit.sig === sig) return hit;
  const originX = Math.floor(map.bounds.x / CELL_UNITS) * CELL_UNITS - GRID_SHIFT;
  const originY = Math.floor(map.bounds.y / CELL_UNITS) * CELL_UNITS - GRID_SHIFT;
  const cols = Math.ceil((map.bounds.x + map.bounds.width - originX) / CELL_UNITS) + 1;
  const rows = Math.ceil((map.bounds.y + map.bounds.height - originY) / CELL_UNITS) + 1;
  const n = cols * rows;
  const walkable = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const c = { x: originX + (i % cols) * CELL_UNITS + CELL_UNITS / 2, y: originY + Math.floor(i / cols) * CELL_UNITS + CELL_UNITS / 2 };
    if (!roomAt(map, c)) continue;
    if (map.obstacles.some(o => pointInPolygon(c, o.points))) continue;
    walkable[i] = 1;
  }
  const g: NavGrid = { originX, originY, cols, rows, walkable, step: new Int8Array(n * 8), stepPortal: new Int16Array(n * 8), sig };
  cache.set(map, g);
  return g;
}

/** World centre of cell i. */
export function cellCentre(g: NavGrid, i: number): Point {
  return { x: g.originX + (i % g.cols) * CELL_UNITS + CELL_UNITS / 2, y: g.originY + Math.floor(i / g.cols) * CELL_UNITS + CELL_UNITS / 2 };
}

/** Column/row of the cell holding p (may be off-grid). */
export function cellXY(g: NavGrid, p: Point): { cx: number; cy: number } {
  return { cx: Math.floor((p.x - g.originX) / CELL_UNITS), cy: Math.floor((p.y - g.originY) / CELL_UNITS) };
}

/** Index of the cell at column/row, or -1 off-grid. */
export function cellIndex(g: NavGrid, cx: number, cy: number): number {
  return cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows ? -1 : cy * g.cols + cx;
}

/** Is the cell holding p walkable? */
export function walkableAt(g: NavGrid, p: Point): boolean {
  const { cx, cy } = cellXY(g, p);
  const i = cellIndex(g, cx, cy);
  return i >= 0 && g.walkable[i] === 1;
}

/** The neighbour of cell i in direction d, or -1. */
export function neighbour(g: NavGrid, i: number, d: number): number {
  const [dx, dy] = DIRS[d];
  return cellIndex(g, (i % g.cols) + dx, Math.floor(i / g.cols) + dy);
}

/** Is the direct step from cell i in direction d free (cached; `allow` lets named portals through)? */
export function stepFree(map: LevelMap, g: NavGrid, i: number, d: number, allow?: (p: Portal) => boolean): boolean {
  const k = i * 8 + d;
  let s = g.step[k];
  if (s === 0) {
    const j = neighbour(g, i, d);
    if (j < 0) { g.step[k] = 2; return false; }
    const r = stepBlocking(map, cellCentre(g, i), cellCentre(g, j), 'move');
    if (!r.blocked) s = 1;
    else if (r.portal) { s = 3; g.stepPortal[k] = map.portals.indexOf(r.portal); }
    else s = 2;
    g.step[k] = s;
  }
  if (s === 1) return true;
  if (s === 2 || !allow) return false;
  const p = map.portals[g.stepPortal[k]];
  if (!p || !allow(p)) return false;
  // The cached blocker is allowed; re-check the whole step in case another blocker sits behind it.
  const j = neighbour(g, i, d);
  return j >= 0 && !stepBlocking(map, cellCentre(g, i), cellCentre(g, j), 'move', allow).blocked;
}

/** The walkable cell nearest to p within `radius` cells (Chebyshev), or -1. */
export function snapToWalkable(g: NavGrid, p: Point, radius: number): number {
  const { cx, cy } = cellXY(g, p);
  let best = -1, bestD = Infinity;
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const i = cellIndex(g, x, y);
      if (i < 0 || g.walkable[i] !== 1) continue;
      const c = cellCentre(g, i);
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}
