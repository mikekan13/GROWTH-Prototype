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

const inputSchema = z.object({
  name: z.string().min(1).max(200).describe('Name of the place.'),
  description: z.string().optional().describe(
    'Short narrative — the WHAT of this place. Cascades to children for lore generation.',
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
