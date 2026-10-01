/**
 * Semantic zoom + depth encoding for the campaign canvas (Mike 2026-09-28:
 * "this is still hard for a human to interpret… Semantic zoom and encode
 * depth lets see it").
 *
 * The sim already runs on render distance; the screen now does too. Zoom is
 * the canvas's own scalar (1 = max zoom in, 6 = max zoom out):
 *   near  — today's full cards.
 *   mid   — items become name chips, characters become portrait chips.
 *   far   — items become dots (no text), characters stay portrait chips,
 *           description strips hide, folder names scale up to stay legible.
 * Depth (0 = a root place, deeper = inside) steps the folder palette from
 * deep Soul blue at the outside toward powder blue at the room, and prefixes
 * the name with one ▸ per level. Pure; thresholds are placeholders to tune.
 */

export type CanvasLod = 'near' | 'mid' | 'far';

export const LOD_TUNING = {
  /** zoom ≥ this = far */
  far: 3.2,
  /** zoom ≥ this = mid */
  mid: 1.9,
  /** folder label grows with zoom so it stays readable when zoomed out */
  labelBase: 36,
  labelMaxScale: 3,
} as const;

export function lodForZoom(zoom: number): CanvasLod {
  if (zoom >= LOD_TUNING.far) return 'far';
  if (zoom >= LOD_TUNING.mid) return 'mid';
  return 'near';
}

/** World-unit font size for a folder label at this zoom (screen size stays roughly constant once zoomed out). */
export function folderLabelSize(zoom: number): number {
  const scale = Math.max(1, Math.min(LOD_TUNING.labelMaxScale, zoom / 1.6));
  return Math.round(LOD_TUNING.labelBase * scale);
}

/** Header fill by depth: Soul blue (Chokmah) at the root, lightening toward the powder-blue surface. */
export const DEPTH_HEADER = ['#002f6c', '#1c4784', '#3a649d', '#5b82b6', '#7d9fcb'] as const;
/** Body fill by depth (rgba of powder blue #CBD9E8, more present the deeper you are). */
export const DEPTH_BODY = ['rgba(203,217,232,0.04)', 'rgba(203,217,232,0.08)', 'rgba(203,217,232,0.13)', 'rgba(203,217,232,0.19)', 'rgba(203,217,232,0.25)'] as const;

export function depthHeaderFill(depth: number | undefined): string {
  return DEPTH_HEADER[Math.min(DEPTH_HEADER.length - 1, Math.max(0, depth ?? 0))];
}
export function depthBodyFill(depth: number | undefined): string {
  return DEPTH_BODY[Math.min(DEPTH_BODY.length - 1, Math.max(0, depth ?? 0))];
}
/** One ▸ per level of containment, so a room reads as "inside inside inside". */
export function depthPrefix(depth: number | undefined): string {
  const d = Math.max(0, Math.min(6, depth ?? 0));
  return d === 0 ? '' : '▸'.repeat(d) + ' ';
}

/** Nesting depth of each location from child→parent edges (roots = 0). Cycles stop at 12. */
export function locationDepths(parentOf: Map<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  const depthOf = (id: string): number => {
    const cached = out.get(id);
    if (cached !== undefined) return cached;
    let d = 0, cur = id;
    const seen = new Set<string>();
    while (parentOf.has(cur) && !seen.has(cur) && d < 12) { seen.add(cur); cur = parentOf.get(cur)!; d++; }
    out.set(id, d);
    return d;
  };
  for (const id of new Set([...parentOf.keys(), ...parentOf.values()])) depthOf(id);
  return out;
}
