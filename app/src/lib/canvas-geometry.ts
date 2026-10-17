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

/** World-unit diameter of an item token (phone-first: ~1 cm at zoom 1.8). */
export const TOKEN_DIAMETER = 72;
/** World-unit diameter of a person's token on the map (2026-10-17: every entity is a token; the sheet opens as an overlay). */
export const CHARACTER_TOKEN_DIAMETER = 120;
/** Room under a person's token for the name label. */
export const CHARACTER_TOKEN_LABEL = 34;
/** Grid cell used by the auto-layout; a token plus breathing room. */
export const TOKEN_CELL = 96;
/** A compact location folder's header (FolderGroup: chrome 80 + gap 6 + details strip 44 + 12). The server-side auto-layout keeps tokens below it. */
export const LOCATION_HEADER_ESTIMATE = 142;

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
