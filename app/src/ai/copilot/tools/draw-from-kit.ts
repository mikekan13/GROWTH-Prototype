/**
 * draw_from_kit — pull an item out of a kit's KV budget on plausible demand.
 *
 * Kits (r-2026-08-24-16): a possession with a finite kvBudget; anything that
 * would plausibly be in the kit and is needed/accessible is pulled FROM that
 * budget on demand — never pre-itemized. Mike marks the mechanic
 * "controversial but fun-chosen"; the mitigations are structural: the
 * PLAUSIBILITY GATE (adjudicated here — a trauma kit yields gauze, not a
 * grappling hook) and the FINITE budget. Ontology-consistent with
 * crystallization: the world resolves on observation.
 *
 * The draw is bookkeeping, not a ledger transfer — the kit's KV was paid
 * when the kit was priced; drawing moves value from potential to concrete.
 * Both objects get history entries (two-ledgers, r-2026-08-19-04).
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  kitItemId: z.string().min(1).max(64).describe(
    'CampaignItem id of the kit instance being drawn from (use the campaign item listing to find it).',
  ),
  name: z.string().min(1).max(100).describe('Name of the drawn item.'),
  description: z.string().min(1).max(500).describe('What the drawn item is.'),
  declaredKv: z.number().int().min(1).max(100).describe(
    'KV of the drawn item — deducted from the kit’s remaining budget. Anchor against stock.',
  ),
  plausibility: z.string().min(1).max(300).describe(
    'One sentence on why this item is plausibly in THIS kit. If you cannot write it honestly, the draw is illegal.',
  ),
  itemData: z.record(z.string(), z.unknown()).optional().describe(
    'Optional GrowthWorldItem fields for the drawn item (primaryMaterial, weightLbs, properties, ...).',
  ),
});

export const drawFromKitTool: JewlTool = {
  name: 'draw_from_kit',
  description:
    'Draw an item out of a kit possession’s KV budget (kits resolve their ' +
    'contents on plausible demand — never pre-itemized). Guards: the target ' +
    'must be a kit, the declaredKv must fit the remaining budget, and the ' +
    'plausibility rationale must hold — a kit only yields what would ' +
    'credibly be inside it. The drawn item lands in the kit holder’s ' +
    'possession; both objects record the draw in their history.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);

    const kit = await prisma.campaignItem.findUnique({ where: { id: parsed.kitItemId } });
    if (!kit) throw new Error(`No campaign item with id ${parsed.kitItemId}`);
    if (kit.campaignId !== ctx.campaignId) throw new Error('Kit belongs to a different campaign.');
    if (kit.status !== 'ACTIVE') throw new Error(`Kit is ${kit.status} — cannot draw.`);

    const kitData = JSON.parse(kit.data) as Record<string, unknown>;
    if (kitData.itemType !== 'kit') {
      throw new Error(`"${kit.name}" is not a kit (itemType=${String(kitData.itemType)}).`);
    }
    const budget = Number(kitData.kvBudget ?? 0);
    const remaining = Number(kitData.kvRemaining ?? budget);
    if (parsed.declaredKv > remaining) {
      throw new Error(
        `Draw of ${parsed.declaredKv} KV exceeds the kit's remaining budget (${remaining}/${budget}).`,
      );
    }

    const now = new Date().toISOString();
    const drawn = await prisma.campaignItem.create({
      data: {
        name: parsed.name,
        type: 'misc',
        campaignId: ctx.campaignId,
        holderId: kit.holderId,
        locationId: kit.locationId,
        createdBy: ctx.actorId,
        data: JSON.stringify({
          description: parsed.description,
          ...(parsed.itemData ?? {}),
          declaredKv: parsed.declaredKv,
          // History ledger — belongs to the OBJECT (r-2026-08-19-04).
          history: [{ at: now, event: `Drawn from kit "${kit.name}"`, plausibility: parsed.plausibility, kv: parsed.declaredKv }],
        }),
      },
    });

    const drawLog = Array.isArray(kitData.drawLog) ? kitData.drawLog as unknown[] : [];
    drawLog.push({ at: now, item: parsed.name, kv: parsed.declaredKv, plausibility: parsed.plausibility, drawnItemId: drawn.id });
    await prisma.campaignItem.update({
      where: { id: kit.id },
      data: {
        data: JSON.stringify({ ...kitData, kvRemaining: remaining - parsed.declaredKv, drawLog }),
      },
    });

    return {
      output: {
        drawnItemId: drawn.id,
        name: parsed.name,
        kv: parsed.declaredKv,
        kitRemaining: remaining - parsed.declaredKv,
        kitBudget: budget,
        holderId: kit.holderId,
      },
    };
  },
};

registerJewlTool(drawFromKitTool);
