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
    'a defect.',
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
      },
    };
  },
};

registerJewlTool(readLocationTool);
