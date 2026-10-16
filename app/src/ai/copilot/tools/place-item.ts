/**
 * place_item — JEWL places a physical object in the world.
 *
 * The scene-dressing half of environment building: mundane objects (the
 * coffee-stained desk, the wicker laundry basket) are campaign items
 * created directly in a room — no approval needed, they carry no
 * mechanics. NEW mechanical designs (a weapon with stats, an artifact)
 * are Forge content: propose_forge_blueprint → GM approval → THEN this
 * tool instantiates from the published blueprint (`fromForgeItem`) —
 * a draft still awaiting approval is refused, which is what lets JEWL
 * keep building around a gated piece and finish it after sign-off.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { createCampaignItem } from '@/services/campaign-item';
import { registerJewlTool } from './registry';
import { resolveCharacterRef } from './resolve-character';
import { resolveLocationRef } from './create-location';
import type { JewlTool, JewlToolHandlerResult } from './types';

const ITEM_TYPES = ['weapon', 'armor', 'accessory', 'consumable', 'tool', 'artifact', 'prima_materia', 'misc'] as const;

const inputSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(ITEM_TYPES).optional().describe('Defaults to misc — right for scene dressing.'),
  description: z.string().max(2000).optional().describe(
    'The object at environment fidelity: material, wear-with-story, exact placement in the room.',
  ),
  weightLevel: z.number().min(0).max(10).optional(),
  tags: z.array(z.string()).max(10).optional(),
  location: z.string().optional().describe('Where it sits: a room (Location name/id) or a CONTAINER item (local name/id — a bookcase, a drawer, a box). The world is a top-down map.'),
  holder: z.string().optional().describe('Character (name or id) carrying it — alternative to location.'),
  fromForgeItem: z.string().optional().describe(
    'Instantiate from a PUBLISHED Forge blueprint (name or id). Refused while the blueprint ' +
      'is still a draft awaiting GM approval — tell the GM and continue building elsewhere.',
  ),
  story: z.string().max(600).optional().describe(
    'NARRATIVE PAINT: this instance\'s story (whose it was, where it came from) — may carry proper nouns. ' +
      'With fromForgeItem, `name` is the instance\'s LOCAL name ("Rosemary\'s keepsake"); the blueprint keeps its archetype name.',
  ),
});

export const placeItemTool: JewlTool = {
  name: 'place_item',
  description:
    'Place a physical object in the world: create a campaign item, optionally ' +
    'located in a room (location) or carried by a character (holder). Items ' +
    'are AUTHORED: propose_forge_blueprint the batch first (full item schema ' +
    '+ notes), let the GM review, then instantiate approved designs here via ' +
    'fromForgeItem. Direct placement without fromForgeItem is ONLY for when ' +
    'the GM explicitly says to skip authoring.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);

    let locationId: string | null = null;
    let locationName: string | null = null;
    // A container item is a place too (2026-10-16): resolve it after Locations.
    let containerId: string | null = null;
    if (parsed.location) {
      const { resolvePlace, enclosingLocationId } = await import('@/services/placement');
      const place = await resolvePlace(ctx.campaignId, parsed.location);
      if (place?.kind === 'item') {
        containerId = place.id;
        locationId = place.locationId ?? await enclosingLocationId(place.id);
        locationName = place.name;
      }
    }
    if (parsed.location && !containerId) {
      const loc = await resolveLocationRef(ctx.campaignId, parsed.location);
      if (!loc) {
        return { output: { ok: false, reason: `No Location "${parsed.location}" in this campaign — create it first with create_location.` } };
      }
      locationId = loc.id;
      locationName = loc.name;
    }

    let holderId: string | null = null;
    let holderName: string | null = null;
    if (parsed.holder) {
      const holder = await resolveCharacterRef(ctx.campaignId, parsed.holder);
      if (!holder) {
        return { output: { ok: false, reason: `No character "${parsed.holder}" in this campaign.` } };
      }
      holderId = holder.id;
      holderName = holder.name;
    }

    let type: (typeof ITEM_TYPES)[number] = parsed.type ?? 'misc';
    let forgeData: Record<string, unknown> = {};
    let source: { id: string; name: string } | null = null;
    if (parsed.fromForgeItem) {
      const ref = parsed.fromForgeItem.trim();
      const blueprint =
        (await prisma.forgeItem.findFirst({ where: { id: ref, campaignId: ctx.campaignId } })) ??
        (await prisma.forgeItem.findFirst({
          where: { campaignId: ctx.campaignId, name: ref },
          orderBy: { updatedAt: 'desc' },
        }));
      if (!blueprint) {
        return { output: { ok: false, reason: `No Forge blueprint "${ref}" in this campaign.` } };
      }
      if (blueprint.status === 'draft') {
        return {
          output: {
            ok: false,
            reason: `Blueprint "${blueprint.name}" is still a DRAFT awaiting GM approval in the Forge panel — tell the GM, keep building the rest, instantiate after sign-off.`,
            blueprintId: blueprint.id,
          },
        };
      }
      source = { id: blueprint.id, name: blueprint.name };
      try {
        forgeData = JSON.parse(blueprint.data) as Record<string, unknown>;
      } catch {
        forgeData = {};
      }
      const forgeType = forgeData.itemType;
      if (typeof forgeType === 'string' && (ITEM_TYPES as readonly string[]).includes(forgeType)) {
        type = forgeType as (typeof ITEM_TYPES)[number];
      }
    }

    // condition 3 = Undamaged (r-2026-04-22-12) unless the blueprint says otherwise.
    const data: Record<string, unknown> = {
      condition: 3,
      weightLevel: parsed.weightLevel ?? 1,
      tags: parsed.tags ?? [],
      ...forgeData,
      ...(parsed.description ? { description: parsed.description } : {}),
    };

    // Service owns the GM/ADMIN gate.
    const item = await createCampaignItem(ctx.campaignId, ctx.actorId, ctx.actorRole, {
      name: parsed.name,
      type,
      data,
      locationId,
      holderId,
      sourceForgeItemId: source?.id ?? null,
      story: parsed.story ?? null,
      origin: source ? `instantiated from the Forge archetype "${source.name}"` : 'placed directly',
    });

    // Canvas folder membership is driven by located_at EDGES, not the
    // locationId column — without this edge the object renders as a
    // free-floating card instead of living inside its room.
    if (containerId || locationId) {
      await prisma.entityRelationship.create({
        data: {
          campaignId: ctx.campaignId,
          sourceId: item.id,
          sourceType: 'CAMPAIGN_ITEM',
          targetId: containerId ?? locationId!,
          targetType: containerId ? 'CAMPAIGN_ITEM' : 'LOCATION',
          relationshipType: 'located_at',
          strength: 5,
        },
      });
    }

    return {
      output: {
        ok: true,
        itemId: item.id,
        name: item.name,
        placedIn: locationName,
        heldBy: holderName,
      },
      affected: { items: [{ id: item.id }] },
    };
  },
};

registerJewlTool(placeItemTool);
