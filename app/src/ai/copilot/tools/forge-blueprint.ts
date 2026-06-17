/**
 * propose_forge_blueprint — JEWL drafts a Forge blueprint and submits it
 * for Kai's evaluation via the existing godhead dispatcher chain.
 *
 * This is JEWL's only creation primitive (for now). He drafts; Kai prices;
 * Et'herling synthesizes; the GM signs off. JEWL does NOT publish directly.
 *
 * See [[forge-vs-jewl-scope-2026-06-07]] (JEWL drafts metaverse content
 * but routes through the chain) and [[forge-chain-recon-2026-06-16]]
 * (the chain is real; this tool is the wiring).
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { emit } from '@/services/godhead-dispatcher';
import { getJewlGodHead } from '../jewl-identity';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const FORGE_TYPES = [
  'seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn',
] as const;

const inputSchema = z.object({
  type: z.enum(FORGE_TYPES).describe(
    'Blueprint type. seed/root/branch shape character creation; skill/item are ' +
      'gameplay primitives; nectar/blossom/thorn are trait variants.',
  ),
  name: z.string().min(1).max(100).describe(
    'Unique within (campaign, type). Use a short, descriptive title.',
  ),
  dataJson: z.string().describe(
    'JSON-encoded blueprint body. Must be valid JSON. Shape varies per type — ' +
      'follow the forge authoring schemas (e.g. skill needs name + governors + description).',
  ),
});
// Note: campaignId is taken from the prompt context (the campaign JEWL is
// operating in). Global-catalog promotion is the Forge chain's job — Kai
// evaluates, Et'herling synthesizes, the GM signs off. JEWL never drafts
// directly to the global catalog.

export const proposeForgeBlueprintTool: JewlTool = {
  name: 'propose_forge_blueprint',
  description:
    'Draft a Forge blueprint (NPC, skill, item, nectar, etc.) and submit it to Kai ' +
    'for evaluation. Use when the GM asks you to create something the world needs to ' +
    'contain. You are recorded as the author. Kai prices, the GM signs off, then it ' +
    'goes live. Returns the draft id immediately so the GM can review it in the Forge ' +
    'panel. Do NOT use this to apply existing items — only to propose NEW ones.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);

    // Validate dataJson parses — fail fast rather than storing garbage.
    try {
      JSON.parse(parsed.dataJson);
    } catch {
      throw new Error('dataJson must be a valid JSON string');
    }

    const jewl = await getJewlGodHead();
    const campaignId = ctx.campaignId;

    // Uniqueness guard — ForgeItem has @@unique([campaignId, name, type]).
    const existing = await prisma.forgeItem.findFirst({
      where: { campaignId, name: parsed.name, type: parsed.type },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        `Blueprint already exists for (campaign=${campaignId}, ` +
          `type=${parsed.type}, name=${parsed.name}): ${existing.id}`,
      );
    }

    const item = await prisma.forgeItem.create({
      data: {
        type: parsed.type,
        name: parsed.name,
        data: parsed.dataJson,
        status: 'draft',
        campaignId,
        isGlobal: false,
        createdBy: jewl.characterUserId,
        authorUserId: jewl.characterUserId,
      },
    });

    // Submit to Kai via the godhead dispatcher. In dev (DISPATCHER_ENABLED
    // off) this just enqueues a PENDING GodHeadInvocation for replay /
    // observability. In prod the dispatcher routes to Kai's agent runtime.
    const dispatchResult = await emit('blueprint.submitted', {
      forgeItemId: item.id,
      type: item.type,
      name: item.name,
      campaignId: item.campaignId,
      proposedBy: 'JEWL',
      proposingGodHeadId: jewl.godHeadId,
    });

    return {
      output: {
        id: item.id,
        type: item.type,
        name: item.name,
        status: item.status,
        campaignId: item.campaignId,
        isGlobal: item.isGlobal,
        proposedBy: 'JEWL',
        dispatcherEnqueued: dispatchResult.enqueued,
        dispatcherSkipped: dispatchResult.skipped,
      },
    };
  },
};

registerJewlTool(proposeForgeBlueprintTool);
