/**
 * Depth encoding for the campaign canvas (Mike 2026-09-28). Depth (0 = a root
 * place, deeper = inside) steps the folder palette from deep Soul blue at the
 * outside toward powder blue at the room, and prefixes the name with one ▸
 * per level. Pure.
 *
 * The SEMANTIC ZOOM that lived here (near/mid/far: chips, dots, growing
 * labels) was REMOVED 2026-10-17 — Mike: "we currently have render zoom
 * levels that change the chips size ect. I want to remove that." The canvas
 * is the physical map; zoom only zooms.
 */

/** Folder label size in world units (fixed — no zoom scaling). */
export const FOLDER_LABEL_SIZE = 36;

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
