/**
 * draw_footprint — JEWL draws a place's SHAPE on the map from what is
 * written about it (Mike 2026-10-17: "We need to be able to change
 * locations to be able to be drawn out so they can have irregular shapes…
 * JEWL should be able to draw them for now using the descriptions").
 *
 * JEWL gives the outline in FEET (origin top-left, x right, y down — an
 * L-shaped studio, a galley kitchen, a crooked attic); the tool stores it
 * as the Location's footprint polygon at the default map scale, keeping
 * the place's level. The canvas draws the polygon; capacity reads its area
 * × ceiling height. Writes go through setLocationGeometry (GM gate, history).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { setLocationGeometry } from '@/services/placement-geometry';
import { DEFAULT_LEVEL, DEFAULT_SCALE_FT_PER_UNIT, parseFootprint } from '@/lib/canvas-geometry';
import { registerJewlTool } from './registry';
import { resolveLocationRef } from './create-location';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  location: z.string().min(1).describe('Name or id of the place.'),
  outlineFt: z.array(z.object({ x: z.number().min(0).max(5000), y: z.number().min(0).max(5000) }))
    .min(3).max(64)
    .describe('The outline in FEET, corner by corner, clockwise from the top-left (0,0). Right angles for walls; as many corners as the shape needs.'),
  ceilingFt: z.number().min(4).max(500).optional().describe('Ceiling height in feet, if the description says.'),
  level: z.number().int().min(-50).max(500).optional().describe('Floor level (0 = ground). Omit to keep the current one.'),
});

/** Feet → map units at the default scale. Pure. */
export function outlineToFootprintPoints(outlineFt: Array<{ x: number; y: number }>, ftPerUnit = DEFAULT_SCALE_FT_PER_UNIT) {
  return outlineFt.map(p => ({ x: Math.round((p.x / ftPerUnit) * 100) / 100, y: Math.round((p.y / ftPerUnit) * 100) / 100 }));
}

export const drawFootprintTool: JewlTool = {
  name: 'draw_footprint',
  description:
    'Draw a place\'s SHAPE on the map from its description: the outline in feet, corner by corner ' +
    '(an L-shaped studio, a galley kitchen), plus the ceiling height when known. Use the sizes the ' +
    'description gives (sq ft, dimensions); never invent a size it contradicts.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const target = await resolveLocationRef(ctx.campaignId, p.location);
    if (!target) return { output: { ok: false, reason: `No Location "${p.location}" in this campaign.` } };
    const row = await prisma.location.findUnique({ where: { id: target.id }, select: { data: true } });
    let current: ReturnType<typeof parseFootprint> = null;
    try { current = parseFootprint((JSON.parse(row?.data ?? '{}') as { footprint?: unknown }).footprint); } catch { current = null; }
    const footprint = {
      points: outlineToFootprintPoints(p.outlineFt),
      scale: DEFAULT_SCALE_FT_PER_UNIT,
      level: p.level ?? current?.level ?? DEFAULT_LEVEL,
      ...(p.ceilingFt != null ? { height: p.ceilingFt } : current?.height != null ? { height: current.height } : {}),
    };
    const r = await setLocationGeometry(ctx.campaignId, target.id, ctx.actorId, ctx.actorRole, { footprint });
    return {
      output: { ok: true, locationId: target.id, name: target.name, corners: footprint.points.length, level: r.footprint?.level ?? footprint.level },
      affected: { locations: [{ id: target.id }] },
    };
  },
};

registerJewlTool(drawFootprintTool);
