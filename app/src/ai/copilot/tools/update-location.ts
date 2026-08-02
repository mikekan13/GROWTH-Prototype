/**
 * update_location — JEWL revises an existing place, including bringing a
 * prose-blob location up to the STANDARD structured spec (the fix-and-
 * standardize pass: image generation, play simulation, and the GM all
 * read the spec fields, not essays). Targeted merges: only supplied
 * fields change; a supplied `spec` REPLACES the stored spec wholesale
 * (JEWL provides the complete restructured spec, never a fragment).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { updateLocation } from '@/services/location';
import { registerJewlTool } from './registry';
import { resolveLocationRef, locationSpecSchema } from './create-location';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  location: z.string().min(1).describe('Location to update (name or id).'),
  name: z.string().min(1).max(200).optional().describe('Rename.'),
  description: z.string().max(3000).optional().describe(
    'SHORT narrative essence — depth belongs in `spec`.',
  ),
  spec: locationSpecSchema.optional().describe(
    'The standardized environment spec — REPLACES the stored spec entirely; supply it complete.',
  ),
  environment: z.string().max(2000).optional(),
  population: z.string().max(500).optional(),
  dangerLevel: z.number().min(1).max(10).optional(),
  controlledBy: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).max(15).optional(),
});

export const updateLocationTool: JewlTool = {
  name: 'update_location',
  description:
    'Revise an existing Location (by name or id): rename, rewrite the short ' +
    'description, and set/replace the standardized environment spec ' +
    '(structure, surfaces, focalPoint, lighting, zones, environmentalSystems, ' +
    'sensory, palette, generation). Use this to bring an unstructured location ' +
    'up to standard — move the depth out of the prose blob into spec fields.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);

    const target = await resolveLocationRef(ctx.campaignId, parsed.location);
    if (!target) {
      return { output: { ok: false, reason: `No Location "${parsed.location}" in this campaign.` } };
    }

    const row = await prisma.location.findUniqueOrThrow({
      where: { id: target.id },
      select: { data: true },
    });
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(row.data) as Record<string, unknown>;
    } catch {
      data = {};
    }

    const changed: string[] = [];
    if (parsed.description !== undefined) { data.description = parsed.description; changed.push('description'); }
    if (parsed.spec !== undefined) { data.spec = parsed.spec; changed.push('spec'); }
    if (parsed.environment !== undefined) { data.environment = parsed.environment; changed.push('environment'); }
    if (parsed.population !== undefined) { data.population = parsed.population; changed.push('population'); }
    if (parsed.dangerLevel !== undefined) { data.dangerLevel = parsed.dangerLevel; changed.push('dangerLevel'); }
    if (parsed.controlledBy !== undefined) { data.controlledBy = parsed.controlledBy; changed.push('controlledBy'); }
    if (parsed.notes !== undefined) { data.notes = parsed.notes; changed.push('notes'); }
    if (parsed.tags !== undefined) { data.tags = parsed.tags; changed.push('tags'); }
    if (parsed.name) changed.push('name');

    if (changed.length === 0) {
      return { output: { ok: false, reason: 'No fields supplied — nothing to change.' } };
    }

    // Service owns the GM/ADMIN gate.
    await updateLocation(target.id, ctx.campaignId, ctx.actorId, ctx.actorRole, {
      ...(parsed.name ? { name: parsed.name } : {}),
      data,
    });

    return {
      output: { ok: true, locationId: target.id, name: parsed.name ?? target.name, changed },
      affected: { locations: [{ id: target.id }] },
    };
  },
};

registerJewlTool(updateLocationTool);
