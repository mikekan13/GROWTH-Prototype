/**
 * read_location — JEWL reads a place back before working on it.
 *
 * The consistency linchpin: the standardized spec is the single source
 * of truth for what a place IS (colors, zones, named objects, light).
 * Furnishing, image prompts, and world facts must derive FROM it — the
 * slate-grey-couch incident happened because JEWL furnished from vague
 * conversational memory instead of reading the forest-green couch in
 * the spec. Returns essence + full spec + flat fields + what already
 * exists inside (child locations, placed items) so he never duplicates
 * or contradicts.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerJewlTool } from './registry';
import { resolveLocationRef } from './create-location';
import type { JewlTool, JewlToolHandlerResult } from './types';
import { DEFAULT_SCALE_FT_PER_UNIT, footprintBounds, parseFootprint, parseMapShape, parseOpenings, parseTokenPosition, fractionToWorld, type Point } from '@/lib/canvas-geometry';

/**
 * The drawn map of a place in FEET, in its HOME's frame (origin = the home outline's top-left) — the same frame
 * draw_place_map takes, so JEWL can place things against what is drawn instead of inventing a plan (2026-10-29: asked
 * to place furniture, it redrew the apartment 20×16 because it had never seen the drawn 20×22.5).
 */
async function drawnMap(campaignId: string, locationId: string, data: Record<string, unknown>) {
  const own = parseFootprint(data.footprint);
  if (!own) return null;
  // The frame: this place's home when it is a room, else itself.
  const up = await prisma.entityRelationship.findFirst({ where: { campaignId, sourceId: locationId, relationshipType: 'located_at', targetType: 'LOCATION' }, select: { targetId: true } });
  const parent = up ? await prisma.location.findUnique({ where: { id: up.targetId }, select: { id: true, name: true, data: true } }) : null;
  let parentData: Record<string, unknown> = {};
  try { parentData = parent ? (JSON.parse(parent.data) as Record<string, unknown>) : {}; } catch { /* empty */ }
  const parentFp = parent ? parseFootprint(parentData.footprint) : null;
  const frameOf = parentFp ? parent! : { id: locationId, name: '' };
  const frameBox = footprintBounds((parentFp ?? own).points);
  const ft = (p: Point) => ({ x: Math.round((p.x - frameBox.x) * DEFAULT_SCALE_FT_PER_UNIT * 10) / 10, y: Math.round((p.y - frameBox.y) * DEFAULT_SCALE_FT_PER_UNIT * 10) / 10 });
  const outlineFt = (pts: Point[]) => pts.map(ft);
  // Rooms drawn inside this place.
  const kids = await prisma.entityRelationship.findMany({ where: { campaignId, targetId: locationId, relationshipType: 'located_at', sourceType: 'LOCATION' }, select: { sourceId: true } });
  const roomRows = kids.length ? await prisma.location.findMany({ where: { id: { in: kids.map(k => k.sourceId) } }, select: { id: true, name: true, data: true } }) : [];
  const rooms = roomRows.flatMap(r => { let d: Record<string, unknown> = {}; try { d = JSON.parse(r.data); } catch { /* empty */ } const fp = parseFootprint(d.footprint); return fp ? [{ id: r.id, name: r.name, outlineFt: outlineFt(fp.points) }] : []; });
  const openings = parseOpenings(data.openings).map(o => ({ id: o.id, name: o.name ?? null, kind: o.kind, state: o.state ?? null, fromFt: ft(o.a), toFt: ft(o.b), between: o.between }));
  // Things already standing on this floor (and on the rooms' floors) with a spot.
  const floorIds = [locationId, ...roomRows.map(r => r.id)];
  const edges = await prisma.entityRelationship.findMany({ where: { campaignId, targetId: { in: floorIds }, relationshipType: 'located_at', sourceType: 'ITEM' }, select: { sourceId: true, targetId: true, data: true } });
  const itemRows = edges.length ? await prisma.campaignItem.findMany({ where: { id: { in: edges.map(e => e.sourceId) } }, select: { id: true, name: true, data: true } }) : [];
  const boxes = new Map<string, ReturnType<typeof footprintBounds>>([[locationId, footprintBounds(own.points)], ...roomRows.flatMap(r => { let d: Record<string, unknown> = {}; try { d = JSON.parse(r.data); } catch { /* empty */ } const fp = parseFootprint(d.footprint); return fp ? [[r.id, footprintBounds(fp.points)] as const] : []; })]);
  const placed = edges.flatMap(e => {
    const it = itemRows.find(i => i.id === e.sourceId);
    if (!it) return [];
    let ed: Record<string, unknown> = {}; try { ed = JSON.parse(e.data ?? '{}'); } catch { /* empty */ }
    const pos = parseTokenPosition(ed.position);
    const box = boxes.get(e.targetId);
    let shapeData: Record<string, unknown> = {}; try { shapeData = JSON.parse(it.data ?? '{}'); } catch { /* empty */ }
    const shape = parseMapShape(shapeData.mapShape);
    const sb = shape ? footprintBounds(shape.points) : null;
    return [{ id: it.id, name: it.name, room: roomRows.find(r => r.id === e.targetId)?.name ?? null, atFt: pos && box ? ft(fractionToWorld(pos, box)) : null, sizeFt: sb ? { w: Math.round(sb.width * 10) / 10, d: Math.round(sb.height * 10) / 10 } : null }];
  });
  return { frame: frameOf.id === locationId ? 'this place (its top-left = 0,0)' : `home "${frameOf.name}" (its top-left = 0,0)`, scaleFtPerUnit: DEFAULT_SCALE_FT_PER_UNIT, outlineFt: outlineFt(own.points), rooms, openings, placed };
}

const inputSchema = z.object({
  location: z.string().min(1).describe('Location to read (name or id).'),
});

export const readLocationTool: JewlTool = {
  name: 'read_location',
  description:
    'Read a Location in full: short description, the standardized spec ' +
    '(structure, surfaces, focalPoint, lighting, zones, environmentalSystems, ' +
    'sensory, palette, generation), flat fields, and what already exists ' +
    'inside it (child locations, placed items). ALWAYS read a location ' +
    'before furnishing it, generating imagery for it, or writing its world ' +
    'facts — the spec is the source of truth; work that contradicts it is ' +
    'a defect. `map` is the drawn map in FEET in the home\'s frame (outline, rooms, openings, things already ' +
    'placed with their spots and sizes): place against it with draw_place_map, never redraw what is drawn.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);

    const target = await resolveLocationRef(ctx.campaignId, parsed.location);
    if (!target) {
      return { output: { ok: false, reason: `No Location "${parsed.location}" in this campaign.` } };
    }

    const row = await prisma.location.findUniqueOrThrow({
      where: { id: target.id },
      select: { id: true, name: true, type: true, status: true, data: true },
    });
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch { /* empty */ }

    const childEdges = await prisma.entityRelationship.findMany({
      where: { campaignId: ctx.campaignId, targetId: target.id, relationshipType: 'located_at' },
      select: { sourceId: true, sourceType: true },
    });
    const childLocIds = childEdges.filter(e => e.sourceType === 'LOCATION').map(e => e.sourceId);
    const childLocations = childLocIds.length
      ? await prisma.location.findMany({ where: { id: { in: childLocIds } }, select: { id: true, name: true, status: true } })
      : [];
    const items = await prisma.campaignItem.findMany({
      where: { campaignId: ctx.campaignId, locationId: target.id },
      select: { id: true, name: true, type: true },
    });

    return {
      output: {
        ok: true,
        locationId: row.id,
        name: row.name,
        status: row.status,
        description: data.description ?? null,
        spec: data.spec ?? null,
        environment: data.environment ?? null,
        population: data.population ?? null,
        dangerLevel: data.dangerLevel ?? null,
        controlledBy: data.controlledBy ?? null,
        notes: data.notes ?? null,
        tags: data.tags ?? null,
        childLocations,
        placedItems: items,
        // The drawn map in feet, in the home's frame — what draw_place_map must be placed against (null = not drawn).
        map: await drawnMap(ctx.campaignId, target.id, data),
      },
    };
  },
};

registerJewlTool(readLocationTool);
