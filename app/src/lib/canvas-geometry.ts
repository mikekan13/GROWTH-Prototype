/**
 * Canvas geometry — the top-down MAP (Mike 2026-10-16: "the canvas can be
 * imagined as a top down view… locations would have to be odd shapes and
 * not just square… if it is a place it takes up space… then we just need
 * verticality too… stories and such").
 *
 * Pure helpers shared by the server page (token positions from edge data),
 * the folder renderer (polygon outline fitted to the drawn rect) and the
 * token layer (grid auto-layout, fraction ↔ world). No React, no Prisma.
 *
 * A FOOTPRINT is a polygon in canvas units + the feet one unit stands for +
 * the story it sits on. It lives in `Location.data.footprint`. A Location
 * without one is drawn from a DEFAULT footprint = its folder rectangle, so
 * nothing changes until JEWL or the GM reshapes it.
 *
 * A TOKEN position is a fraction (0..1) of its room's footprint bounding
 * box, stored on the item's `located_at` edge as `data.position`. Fractions
 * survive the room being moved or resized.
 */

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }

export interface Footprint {
  /** Polygon vertices in canvas units (absolute world coords when stored). */
  points: Point[];
  /** Feet per canvas unit. */
  scale: number;
  /** Story index: 0 = ground / outdoors, 1 = first floor up, -1 = cellar. */
  level: number;
  /** Ceiling height in feet, when it matters. */
  height?: number;
}

/** A passage (stairs, fire escape, elevator) links a Location to levels. */
export interface PassageLink { locationId: string; level: number }

export interface TokenPosition { x: number; y: number }

export const DEFAULT_SCALE_FT_PER_UNIT = 0.05; // 20 units ≈ 1 ft — a 560-wide tile reads as a 28 ft room
export const DEFAULT_LEVEL = 0;

/** World-unit diameter of a THING's marker = 2 ft on the 5-ft grid (2026-10-17: at 72 = 3.6 ft a galley's ten things could not fit). */
export const TOKEN_DIAMETER = 40;
/** A person's token = ONE 5-ft square (Mike 2026-10-17: "normal 5 foot space rules for a token like in typical trpgs"; 20 units = 1 ft). */
export const CHARACTER_TOKEN_DIAMETER = 100;
/** Room under a person's token for the name label. */
export const CHARACTER_TOKEN_LABEL = 34;
/** Grid cell used by the auto-layout = one 5-ft square (100 units). */
export const TOKEN_CELL = 100;
/** A place's map label strip (FolderGroup MAP_LABEL_H — places have no header since 2026-10-17). The server-side auto-layout keeps tokens below it. */
export const LOCATION_HEADER_ESTIMATE = 44;

// ── Footprints ──────────────────────────────────────────────────────────────

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parse `Location.data.footprint`; null when absent or malformed. */
export function parseFootprint(raw: unknown): Footprint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.points) || o.points.length < 3) return null;
  const points: Point[] = [];
  for (const p of o.points) {
    if (!p || typeof p !== 'object') return null;
    const { x, y } = p as Record<string, unknown>;
    if (!isFiniteNum(x) || !isFiniteNum(y)) return null;
    points.push({ x, y });
  }
  const scale = isFiniteNum(o.scale) && o.scale > 0 ? o.scale : DEFAULT_SCALE_FT_PER_UNIT;
  const level = isFiniteNum(o.level) ? Math.round(o.level) : DEFAULT_LEVEL;
  const height = isFiniteNum(o.height) && o.height > 0 ? o.height : undefined;
  return { points, scale, level, ...(height != null ? { height } : {}) };
}

/** Parse `Location.data.connects` (a passage's links). Empty when absent. */
export function parsePassageLinks(raw: unknown): PassageLink[] {
  if (!Array.isArray(raw)) return [];
  const out: PassageLink[] = [];
  for (const c of raw) {
    if (!c || typeof c !== 'object') continue;
    const { locationId, level } = c as Record<string, unknown>;
    if (typeof locationId !== 'string' || !isFiniteNum(level)) continue;
    out.push({ locationId, level: Math.round(level) });
  }
  return out;
}

/**
 * OPENINGS (Mike 2026-10-17: "We need openings, doors windows ect… we need
 * doors at least for now"). Stored on the HOME Location (`data.openings`):
 * a wall segment a→b in absolute map units, what it joins, and — for a
 * door — whether it stands open, closed or locked.
 */
export type OpeningKind = 'door' | 'window' | 'archway' | 'opening';
export type DoorState = 'open' | 'closed' | 'locked';
export const OPENING_KINDS: readonly OpeningKind[] = ['door', 'window', 'archway', 'opening'];
export const DOOR_STATES: readonly DoorState[] = ['open', 'closed', 'locked'];
export interface Opening {
  id: string;
  kind: OpeningKind;
  a: Point;
  b: Point;
  /** What it joins: room names, or "outside" / "stairwell" / "fire escape". */
  between: string[];
  state?: DoorState;
  name?: string;
}

export function parseOpenings(raw: unknown): Opening[] {
  if (!Array.isArray(raw)) return [];
  const out: Opening[] = [];
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    const a = r.a as Record<string, unknown> | undefined;
    const b = r.b as Record<string, unknown> | undefined;
    if (typeof r.id !== 'string' || !OPENING_KINDS.includes(r.kind as OpeningKind)) continue;
    if (!a || !b || !isFiniteNum(a.x) || !isFiniteNum(a.y) || !isFiniteNum(b.x) || !isFiniteNum(b.y)) continue;
    out.push({
      id: r.id,
      kind: r.kind as OpeningKind,
      a: { x: a.x, y: a.y },
      b: { x: b.x, y: b.y },
      between: Array.isArray(r.between) ? r.between.filter((s): s is string => typeof s === 'string') : [],
      ...(DOOR_STATES.includes(r.state as DoorState) ? { state: r.state as DoorState } : {}),
      ...(typeof r.name === 'string' ? { name: r.name } : {}),
    });
  }
  return out;
}

/** The next door state when tapped: closed → open → locked → closed. Pure. */
export function nextDoorState(s: DoorState | undefined): DoorState {
  return s === 'closed' || s === undefined ? 'open' : s === 'open' ? 'locked' : 'closed';
}

/** The DEFAULT footprint: the folder rectangle itself, four corners clockwise. */
export function defaultFootprintFromRect(rect: Rect, level = DEFAULT_LEVEL, scale = DEFAULT_SCALE_FT_PER_UNIT): Footprint {
  const { x, y, width, height } = rect;
  return {
    points: [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ],
    scale,
    level,
  };
}

/** Axis-aligned bounding box of a polygon. Degenerate polygons get a 1×1 box. */
export function footprintBounds(points: Point[]): Rect {
  if (points.length === 0) return { x: 0, y: 0, width: 1, height: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** True when the polygon is just its own bounding rectangle (4 corners, any order). */
export function isRectangular(points: Point[]): boolean {
  if (points.length !== 4) return false;
  const b = footprintBounds(points);
  const corners = [
    [b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height],
  ];
  return corners.every(([cx, cy]) => points.some(p => Math.abs(p.x - cx) < 0.5 && Math.abs(p.y - cy) < 0.5));
}

/**
 * Map a stored polygon onto the rect a folder is DRAWN with right now. The
 * drawn rect is the footprint's bounding box on screen; the shape inside it
 * is preserved, so a dragged or resized room keeps its outline without a
 * server write (positions never persist from a drag).
 */
export function fitPolygonToRect(points: Point[], target: Rect): Point[] {
  const b = footprintBounds(points);
  const sx = target.width / b.width;
  const sy = target.height / b.height;
  return points.map(p => ({ x: target.x + (p.x - b.x) * sx, y: target.y + (p.y - b.y) * sy }));
}

/** Ray-casting point-in-polygon; a point on an edge counts as inside. */
export function pointInPolygon(p: Point, points: Point[]): boolean {
  const n = points.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = points[i], b = points[j];
    // On-edge test (collinear + within segment box).
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9
      && p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9
      && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9) return true;
    const intersects = (a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** SVG `points` attribute for a polygon. */
export function polygonPointsAttr(points: Point[]): string {
  return points.map(p => `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`).join(' ');
}

/** "28 × 18 ft" for a footprint at its scale. */
export function footprintSizeLabel(fp: Footprint): string {
  const b = footprintBounds(fp.points);
  const w = Math.round(b.width * fp.scale);
  const h = Math.round(b.height * fp.scale);
  return `${w} × ${h} ft`;
}

/** "L2", "G" (ground), "B1" (cellar). */
export function levelLabel(level: number): string {
  if (level === 0) return 'G';
  return level > 0 ? `L${level}` : `B${-level}`;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Parse an edge's `data.position` ({x,y} fractions). */
export function parseTokenPosition(raw: unknown): TokenPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y } = raw as Record<string, unknown>;
  if (!isFiniteNum(x) || !isFiniteNum(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

/** Fraction of a box → world point. */
export function fractionToWorld(frac: TokenPosition, box: Rect): Point {
  return { x: box.x + clamp01(frac.x) * box.width, y: box.y + clamp01(frac.y) * box.height };
}

/** World point → fraction of a box (clamped to 0..1, 4 decimals). */
export function worldToFraction(p: Point, box: Rect): TokenPosition {
  const fx = box.width > 0 ? (p.x - box.x) / box.width : 0;
  const fy = box.height > 0 ? (p.y - box.y) / box.height : 0;
  return { x: Math.round(clamp01(fx) * 10000) / 10000, y: Math.round(clamp01(fy) * 10000) / 10000 };
}

/**
 * The interior a room offers its tokens: the footprint box minus the folder
 * header (tokens never sit on the name bar) and a padding ring.
 */
export function tokenArea(box: Rect, headerHeight: number, padding = 30): Rect {
  const x = box.x + padding;
  const y = box.y + headerHeight + padding;
  return {
    x, y,
    width: Math.max(TOKEN_CELL, box.width - padding * 2),
    height: Math.max(TOKEN_CELL, box.height - headerHeight - padding * 2),
  };
}

/**
 * Tidy grid for tokens with no stored position: row-major, left to right,
 * as many columns as fit the area, centred in each cell. Returns token
 * CENTRES in world units, in input order.
 */
export function autoLayoutGrid(count: number, area: Rect, cell = TOKEN_CELL): Point[] {
  const out: Point[] = [];
  if (count <= 0) return out;
  const cols = Math.max(1, Math.floor(area.width / cell));
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ x: area.x + c * cell + cell / 2, y: area.y + r * cell + cell / 2 });
  }
  return out;
}

/** Marker grid cell for things inside a drawn room (2.5 ft). */
export const ITEM_CELL = 50;

/** A grid that never leaves the area: past the last row it wraps, offset a third of a cell (things pile, they never spill). */
export function clampedLayoutGrid(count: number, area: Rect, cell = ITEM_CELL): Point[] {
  const cols = Math.max(1, Math.floor(area.width / cell));
  const rows = Math.max(1, Math.floor(area.height / cell));
  const out: Point[] = [];
  for (let i = 0; i < count; i++) {
    const layer = Math.floor(i / (cols * rows));
    const j = i % (cols * rows);
    const off = (layer * cell) / 3;
    out.push({
      x: Math.min(area.x + area.width - cell / 4, area.x + (j % cols) * cell + cell / 2 + off),
      y: Math.min(area.y + area.height - cell / 4, area.y + Math.floor(j / cols) * cell + cell / 2 + off),
    });
  }
  return out;
}

/** Rows a grid of `count` tokens needs in `area`. */
export function autoLayoutRows(count: number, area: Rect, cell = TOKEN_CELL): number {
  if (count <= 0) return 0;
  const cols = Math.max(1, Math.floor(area.width / cell));
  return Math.ceil(count / cols);
}

/**
 * The 1–2 letter mark on a token: initials of the first two meaningful
 * words ("The desk lamp" → "DL", "Rosemary's recipes" → "RR", "Lamp" → "LA").
 */
export function tokenMark(name: string): string {
  const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'her', 'his', 'their', 'my']);
  const words = name
    .replace(/['’][a-z]+\b/gi, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(w => w.length > 0 && !STOP.has(w.toLowerCase()));
  if (words.length === 0) {
    const raw = name.replace(/[^A-Za-z0-9]/g, '');
    return (raw.slice(0, 2) || '?').toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Ring colour by item type — the pillar/teal language of the canvas. */
export function tokenRingColor(itemType: string | undefined): string {
  switch (itemType) {
    case 'weapon':
    case 'armor':
      return '#f7525f'; // Body
    case 'consumable':
    case 'prima_materia':
      return '#582a72'; // Spirit
    case 'artifact':
    case 'accessory':
      return '#002f6c'; // Soul
    default:
      return '#22ab94'; // Terminal teal — tools, misc
  }
}

// ── Levels ──────────────────────────────────────────────────────────────────

export interface LeveledPlace {
  id: string;
  level: number;
  /** Levels a passage links; empty for a plain place. */
  connects?: number[];
}

/** Every level present, highest first (an elevator panel reads top-down). */
export function levelsPresent(places: LeveledPlace[]): number[] {
  const s = new Set<number>();
  for (const p of places) {
    s.add(p.level);
    for (const l of p.connects ?? []) s.add(l);
  }
  return [...s].sort((a, b) => b - a);
}

/** Does a place show on `level`? Passages show on every level they link. */
export function visibleOnLevel(place: LeveledPlace, level: number | null): boolean {
  if (level === null) return true;
  if (place.level === level) return true;
  return (place.connects ?? []).includes(level);
}

// ── Grid snapping + walls (Mike 2026-10-17: "We have a grid already in the
// background and it should snap to that as best it can"; "her bathroom has a
// door to outside"). All in FEET in a home's frame; the map grid is 5-ft
// squares with half-square (2.5 ft) lines.
export const GRID_FT = 5;
export const HALF_GRID_FT = GRID_FT / 2;

/** Nearest multiple of `step`. Pure. */
export function snapTo(v: number, step: number): number {
  return Math.round(v / step) * step;
}
/** Centre of the cell of size `step` that holds v. Pure. */
export function cellCentre(v: number, step: number): number {
  return Math.floor(v / step) * step + step / 2;
}
/** Walls on half-squares. Pure. */
export function snapOutline(points: Point[]): Point[] {
  const out = points.map(p => ({ x: snapTo(p.x, HALF_GRID_FT), y: snapTo(p.y, HALF_GRID_FT) }));
  return out.filter((p, i) => i === 0 || p.x !== out[i - 1].x || p.y !== out[i - 1].y);
}

export interface WallEdge { owner: string; a: Point; b: Point }

/** Every edge of every polygon, tagged with its owner. Pure. */
export function wallEdges(polys: Array<{ owner: string; points: Point[] }>): WallEdge[] {
  const out: WallEdge[] = [];
  for (const p of polys) for (let i = 0; i < p.points.length; i++) out.push({ owner: p.owner, a: p.points[i], b: p.points[(i + 1) % p.points.length] });
  return out;
}

function projectOnSegment(p: Point, a: Point, b: Point): { point: Point; dist: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy;
  const t = L === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return { point: q, dist: Math.hypot(p.x - q.x, p.y - q.y) };
}

/** Put an opening ON the nearest wall: both ends projected onto the wall its middle is closest to. Pure. */
export function snapOpeningToWall(from: Point, to: Point, edges: WallEdge[]): { from: Point; to: Point; wall: WallEdge | null } {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  let best: { e: WallEdge; d: number } | null = null;
  for (const e of edges) {
    const d = projectOnSegment(mid, e.a, e.b).dist;
    if (!best || d < best.d) best = { e, d };
  }
  if (!best) return { from, to, wall: null };
  const r = (p: Point) => { const q = projectOnSegment(p, best!.e.a, best!.e.b).point; return { x: Math.round(q.x * 2) / 2, y: Math.round(q.y * 2) / 2 }; };
  return { from: r(from), to: r(to), wall: best.e };
}

/**
 * Size an opening to the grid along its wall (Mike 2026-10-17: "if violet
 * takes up a 5 by 5 foot space then the doors in her apartment are extremely
 * small"): a door / archway spans whole 5-ft squares (at least one), a window
 * half-squares (at least 2.5 ft); centred where it was put, kept on the wall.
 * Feet. Pure.
 */
export function gridSizedOpening(kind: OpeningKind, from: Point, to: Point, wall: WallEdge | null): { from: Point; to: Point } {
  const step = kind === 'window' ? HALF_GRID_FT : GRID_FT;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  const wallLen = wall ? Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) : Infinity;
  // Never longer than the wall it sits on.
  const want = Math.min(wallLen, Math.max(step, Math.round(len / step) * step));
  const ux = len > 0 ? (to.x - from.x) / len : (wall ? (wall.b.x - wall.a.x) / Math.max(1e-9, Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)) : 1);
  const uy = len > 0 ? (to.y - from.y) / len : (wall ? (wall.b.y - wall.a.y) / Math.max(1e-9, Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)) : 0);
  let mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  if (wall) {
    // Keep the whole opening on the wall: slide the middle inward if it would overhang a corner.
    const wl = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y);
    const t = wl > 0 ? ((mid.x - wall.a.x) * (wall.b.x - wall.a.x) + (mid.y - wall.a.y) * (wall.b.y - wall.a.y)) / (wl * wl) : 0.5;
    const half = Math.min(want, wl) / 2 / Math.max(wl, 1e-9);
    const tc = Math.max(half, Math.min(1 - half, t));
    mid = { x: wall.a.x + tc * (wall.b.x - wall.a.x), y: wall.a.y + tc * (wall.b.y - wall.a.y) };
  }
  const h = want / 2;
  const r = (v: number) => Math.round(v * 2) / 2;
  return { from: { x: r(mid.x - ux * h), y: r(mid.y - uy * h) }, to: { x: r(mid.x + ux * h), y: r(mid.y + uy * h) } };
}

/**
 * What an opening really joins, from the walls it sits on: every ROOM whose
 * wall carries it; if only one room does and the HOME outline carries it
 * too, the other side is outside. Pure.
 */
export function openingSides(from: Point, to: Point, rooms: Array<{ owner: string; points: Point[] }>, home: Point[] | null, tol = 0.35): string[] {
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const onWalls = (pts: Point[]) => wallEdges([{ owner: '', points: pts }]).some(e => projectOnSegment(mid, e.a, e.b).dist <= tol);
  const sides = rooms.filter(r => onWalls(r.points)).map(r => r.owner);
  if (sides.length < 2 && home && onWalls(home)) sides.push('outside');
  return [...new Set(sides)];
}

// ── Things take up space (Mike 2026-10-17: "items can take up space too and be
// irregular sizes just like a location. If it takes up less than a 5b5 then…
// small little pins"). A thing's map shape = polygon in FEET around its centre.
export interface MapShape { points: Point[] }
/** Pin diameter for a thing smaller than a square (world units ≈ 1.2 ft). */
export const PIN_DIAMETER = 24;

/** A w×d rectangle (or a given outline) centred on the thing, rotated by 0/90/180/270. Pure. */
export function makeMapShape(opts: { sizeFt?: { w: number; d: number }; outlineFt?: Point[]; rotation?: number }): MapShape | null {
  let pts: Point[];
  if (opts.outlineFt && opts.outlineFt.length >= 3) {
    const b = footprintBounds(opts.outlineFt);
    pts = opts.outlineFt.map(p => ({ x: p.x - b.x - b.width / 2, y: p.y - b.y - b.height / 2 }));
  } else if (opts.sizeFt && opts.sizeFt.w > 0 && opts.sizeFt.d > 0) {
    const { w, d } = opts.sizeFt;
    pts = [{ x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: d / 2 }, { x: -w / 2, y: d / 2 }];
  } else return null;
  const r = (((opts.rotation ?? 0) % 360) + 360) % 360;
  const rot = (p: Point): Point => r === 90 ? { x: -p.y, y: p.x } : r === 180 ? { x: -p.x, y: -p.y } : r === 270 ? { x: p.y, y: -p.x } : p;
  return { points: pts.map(rot).map(p => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 })) };
}

export function parseMapShape(raw: unknown): MapShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const pts = (raw as { points?: unknown }).points;
  if (!Array.isArray(pts) || pts.length < 3) return null;
  const out: Point[] = [];
  for (const p of pts) { const q = p as Record<string, unknown>; if (!isFiniteNum(q?.x) || !isFiniteNum(q?.y)) return null; out.push({ x: q.x as number, y: q.y as number }); }
  return { points: out };
}

/**
 * Does a thing's footprint (feet about its centre) lie inside the room (world units) — every corner in or on the
 * polygon? A couch half through the bathroom wall is not placed (Mike 2026-10-29). Pure.
 */
export function shapeInsideRoom(centre: Point, shape: MapShape | null, room: Point[], ftPerUnit = DEFAULT_SCALE_FT_PER_UNIT, tolUnits = 1): boolean {
  if (!shape) return pointInPolygon(centre, room);
  const k = 1 / ftPerUnit;
  return shape.points.every(p => {
    const q = { x: centre.x + p.x * k, y: centre.y + p.y * k };
    if (pointInPolygon(q, room)) return true;
    // on the wall line counts as inside
    return room.some((a, i) => { const b = room[(i + 1) % room.length]; return projectOnSegment(q, a, b).dist <= tolUnits; });
  });
}

/** A thing whose long side reaches this many feet is drawn as its footprint (Mike 2026-10-29: "we should really have
 *  token sizes appropriate for what they are … a bed takes up more than 5×5 … they shouldn't be round"); smaller
 *  things (a lamp, a mug, a pen) are pins. Was 5 ft, which made a 4×2 desk a pin. */
export const SHAPE_MIN_FT = 1.5;
/** Drawn as its shape when its long side reaches SHAPE_MIN_FT; else a pin. Pure. */
export function drawsAsShape(shape: MapShape | null): boolean {
  if (!shape) return false;
  const b = footprintBounds(shape.points);
  return Math.max(b.width, b.height) >= SHAPE_MIN_FT;
}
