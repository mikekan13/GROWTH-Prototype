/**
 * create_location — JEWL builds a place in THIS campaign's world.
 *
 * Campaign-local world-building is NOT Forge content: the Forge chain
 * (propose_forge_blueprint → Kai → GM sign-off) is for reusable
 * character-creation / gameplay blueprints. A room, an apartment, a
 * tavern, a district — those are Locations, created directly (the same
 * service the canvas create dialog uses) and immediately visible as
 * folders on the canvas. Locations nest: pass parentLocation to place
 * the new one inside an existing place (located_at edge, which is what
 * the canvas folder system reads — see
 * [[world-as-recursive-locations-and-crystallization-2026-06-03]]).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createLocation } from '@/services/location';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

/**
 * The STANDARD environment spec — the fidelity exemplar's sections as
 * structured fields. Three consumers depend on this structure staying
 * consistent: image generation (palette/lighting/composition), play
 * simulation (surfaces/zones feed world facts and the adjudicator), and
 * the GM reading it. Prose blobs in `description` don't serve any of
 * them — `description` stays the short narrative essence; the depth
 * lives HERE, field by field.
 */
export const locationSpecSchema = z.object({
  // Field descriptions kept terse (2026-10-12): every spec ships this schema
  // to the model; the field names carry most of the meaning.
  structure: z.string().max(2500).optional().describe('Type, footprint, ceiling, layout from the entry.'),
  surfaces: z.string().max(2500).optional().describe('Walls/ceiling/floor: material, wear-with-story, behavior.'),
  focalPoint: z.string().max(1200).optional().describe('What the room is ABOUT.'),
  lighting: z
    .object({
      primary: z.string().max(600).optional(),
      behavior: z.string().max(800).optional(),
      colorTemperature: z.string().max(200).optional().describe('Kelvin per zone.'),
      secondarySources: z.array(z.string().max(300)).max(8).optional(),
      effect: z.string().max(300).optional().describe('Mood sentence.'),
    })
    .optional(),
  zones: z
    .array(
      z.object({
        name: z.string().max(100),
        description: z.string().max(2500).describe('Full-fidelity zone; objects also via place_item.'),
      }),
    )
    .max(12)
    .optional()
    .describe('Areas in this place; rooms are child Locations.'),
  environmentalSystems: z.string().max(1200).optional().describe('What pervades the space + its rule.'),
  sensory: z
    .object({
      scent: z.string().max(400).optional(),
      sound: z.string().max(400).optional(),
      temperature: z.string().max(400).optional(),
    })
    .optional(),
  palette: z
    .array(z.object({
      element: z.string().max(60),
      hex: z.string().max(40),
      note: z.string().max(100).optional(),
    }))
    .max(12)
    .optional(),
  generation: z
    .object({
      heroComposition: z.string().max(600).optional(),
      constraints: z.array(z.string().max(300)).max(10).optional(),
      openQuestion: z.string().max(300).optional(),
      timeLock: z.string().max(200).optional(),
    })
    .optional(),
});

const inputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().describe('SHORT essence; depth goes in spec.'),
  spec: locationSpecSchema.optional().describe('Standard environment spec (play-ready fidelity).'),
  parentLocation: z.string().optional().describe('Existing Location (name/id) to nest inside.'),
  environment: z.string().optional(),
  population: z.string().optional(),
  dangerLevel: z.number().min(1).max(10).optional(),
  controlledBy: z.string().optional(),
  notes: z.string().optional().describe('GM-only.'),
  tags: z.array(z.string()).optional(),
  canvasX: z.number().optional().describe('Omit to auto-place.'),
  canvasY: z.number().optional(),
});

/** Location ref resolver (id or name, campaign-scoped) — shared with
 * place_item and any tool that names a place. */
export async function resolveLocationRef(
  campaignId: string,
  ref: string,
): Promise<{ id: string; name: string } | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const byId = await prisma.location.findFirst({
    where: { id: trimmed, campaignId },
    select: { id: true, name: true },
  });
  if (byId) return byId;
  const candidates = await prisma.location.findMany({
    where: { campaignId },
    select: { id: true, name: true },
    orderBy: { updatedAt: 'desc' },
  });
  const lower = trimmed.toLowerCase();
  return (
    candidates.find(l => l.name.toLowerCase() === lower) ??
    candidates.find(l => l.name.toLowerCase().startsWith(lower)) ??
    null
  );
}

export const createLocationTool: JewlTool = {
  name: 'create_location',
  description:
    'Create a Location in THIS campaign (room, building, district, region); ' +
    'it appears on the canvas at once. parentLocation nests it (rooms inside ' +
    'an apartment). World-building uses THIS, never propose_forge_blueprint.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);

    let parent: { id: string; name: string } | null = null;
    if (parsed.parentLocation) {
      parent = await resolveLocationRef(ctx.campaignId, parsed.parentLocation);
      if (!parent) {
        const existing = await prisma.location.findMany({
          where: { campaignId: ctx.campaignId },
          select: { name: true },
          take: 25,
        });
        return {
          output: {
            ok: false,
            error: `No Location named "${parsed.parentLocation}" in this campaign.`,
            existingLocations: existing.map(l => l.name),
          },
        };
      }
    }

    // The service gates on canManageCampaign (GM of record or ADMIN).
    const location = await createLocation(ctx.campaignId, ctx.actorId, ctx.actorRole, {
      name: parsed.name,
      type: 'point_of_interest',
      // Base data carries the structured spec; the service layers the
      // flat fields (description, environment, ...) on top of it.
      data: {
        description: '',
        tags: [],
        features: [],
        connections: [],
        ...(parsed.spec ? { spec: parsed.spec } : {}),
      },
      description: parsed.description,
      environment: parsed.environment,
      population: parsed.population,
      dangerLevel: parsed.dangerLevel,
      controlledBy: parsed.controlledBy,
      notes: parsed.notes,
      tags: parsed.tags,
      canvasX: parsed.canvasX,
      canvasY: parsed.canvasY,
    });

    if (parent) {
      await prisma.entityRelationship.create({
        data: {
          campaignId: ctx.campaignId,
          sourceId: location.id,
          sourceType: 'LOCATION',
          targetId: parent.id,
          targetType: 'LOCATION',
          relationshipType: 'located_at',
          strength: 5,
        },
      });
    }

    return {
      output: {
        ok: true,
        locationId: location.id,
        name: location.name,
        nestedInside: parent ? parent.name : null,
      },
      affected: { locations: [{ id: location.id }] },
    };
  },
};

registerJewlTool(createLocationTool);
