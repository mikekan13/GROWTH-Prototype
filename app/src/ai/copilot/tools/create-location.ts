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
  structure: z.string().max(2500).optional().describe(
    'Type, footprint (sq ft/m²), ceiling height, and a layout walkthrough from the entry.',
  ),
  surfaces: z.string().max(2500).optional().describe(
    'Walls, ceiling, flooring: materials, condition-with-stories (an ink stain is work, a worn path is habit), and behavior (creaks, drafts).',
  ),
  focalPoint: z.string().max(1200).optional().describe('The element the room is ABOUT, rendered fully.'),
  lighting: z
    .object({
      primary: z.string().max(600).optional().describe('Main source + character (e.g. late-autumn ~4PM amber through the front window).'),
      behavior: z.string().max(800).optional().describe('How the light moves and lands — beams, bounce, shadow zones, dust motes.'),
      colorTemperature: z.string().max(200).optional().describe('Kelvin values per zone, e.g. "2800-3200K sunbeam; ~4500K desaturated shadow".'),
      secondarySources: z.array(z.string().max(300)).max(8).optional().describe('Other fixtures, on or off — presence matters even when off.'),
      effect: z.string().max(300).optional().describe('The mood sentence — what the light DOES to the room.'),
    })
    .optional(),
  zones: z
    .array(
      z.object({
        name: z.string().max(100),
        description: z.string().max(2500).describe(
          'The zone at full fidelity: furniture, what sits on/under/beside what, every object with a story-reason. Objects themselves are ALSO placed via place_item at this location, with exact placement in each item description.',
        ),
      }),
    )
    .max(12)
    .optional()
    .describe('Areas within this place (desk zone, couch zone...). Zones are description-level; rooms are child Locations.'),
  environmentalSystems: z.string().max(1200).optional().describe(
    'What inhabits the space pervasively, plus its generation rule (e.g. "Books are not stored; they inhabit... no book looks new").',
  ),
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
    .optional()
    .describe('Hex reference per element — image generation reads this.'),
  generation: z
    .object({
      heroComposition: z.string().max(600).optional().describe('Camera-favored angle and what anchors the frame.'),
      constraints: z.array(z.string().max(300)).max(10).optional().describe('Hard rules, e.g. "Nothing matches", "Wear is specific, not procedural".'),
      openQuestion: z.string().max(300).optional().describe('The one mandatory open question the room asks.'),
      timeLock: z.string().max(200).optional().describe('If the light/time is locked, say so.'),
    })
    .optional(),
});

const inputSchema = z.object({
  name: z.string().min(1).max(200).describe('Name of the place.'),
  description: z.string().optional().describe(
    'SHORT narrative essence — one paragraph of what this place is. The depth goes in `spec`, field by field, never dumped here.',
  ),
  spec: locationSpecSchema.optional().describe(
    'The standardized environment spec. REQUIRED in practice for any place being built to play-ready fidelity.',
  ),
  parentLocation: z.string().optional().describe(
    'Name or id of an EXISTING Location to nest this place inside ' +
      '(e.g. a room inside an apartment). Omit for a top-level place.',
  ),
  environment: z.string().optional().describe('Climate / terrain / atmosphere.'),
  population: z.string().optional().describe('Narrative population descriptor.'),
  dangerLevel: z.number().min(1).max(10).optional(),
  controlledBy: z.string().optional().describe('Faction / NPC / "contested".'),
  notes: z.string().optional().describe('GM-only notes.'),
  tags: z.array(z.string()).optional(),
  canvasX: z.number().optional().describe('Canvas world X for the card. Omit to auto-place.'),
  canvasY: z.number().optional().describe('Canvas world Y for the card. Omit to auto-place.'),
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
    'Create a Location in THIS campaign — a room, building, district, region, ' +
    'any place in the world. It appears on the canvas immediately (a folder ' +
    'the GM can drill into). Pass parentLocation (name or id) to nest it ' +
    'inside an existing place — e.g. each room of an apartment is a child of ' +
    'the apartment. Use THIS for world-building, never propose_forge_blueprint ' +
    '(the Forge is for reusable character/gameplay blueprints, not places).',
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
