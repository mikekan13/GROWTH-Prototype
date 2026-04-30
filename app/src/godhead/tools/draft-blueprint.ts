/**
 * draft_blueprint — Create a ForgeItem in `draft` status, authored
 * by the invoking god-head.
 *
 * `data` is stored as a JSON string. The agent passes it already
 * encoded — we do not try to reshape it here. Kai will later
 * evaluate and assign karmic value.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const FORGE_TYPES = ['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn'] as const;

const inputSchema = z.object({
  type: z.enum(FORGE_TYPES).describe('Blueprint type'),
  name: z.string().describe('Unique name within (campaign, type). Keep under 100 chars.'),
  dataJson: z.string().describe('JSON-encoded blueprint body. Follow the shape expected for this type (see forge authoring schemas).'),
  campaignId: z.string().describe('Campaign this draft belongs to. Omit for a global-catalog draft.').optional(),
});

registerTool({
  name: 'draft_blueprint',
  description: 'Create a ForgeItem in draft status. You are recorded as the author. Kai (or a human) must evaluate and publish before it can be instantiated. Use this when resistance, a goal, or an observation demands something the world needs to contain.',
  inputSchema,
  handler: async (input, context) => {
    const { type, name, dataJson, campaignId } = input as z.infer<typeof inputSchema>;

    // Validate dataJson is parseable so we fail fast rather than storing garbage.
    try {
      JSON.parse(dataJson);
    } catch {
      throw new Error('dataJson must be a valid JSON string');
    }

    // Resolve the authoring user: god-head's Character -> userId.
    const godhead = await prisma.godHead.findUnique({
      where: { id: context.godHeadId },
      include: { character: { select: { userId: true } } },
    });
    if (!godhead) throw new Error(`God-head not found: ${context.godHeadId}`);
    const authorUserId = godhead.character.userId;

    // Uniqueness guard — ForgeItem has @@unique([campaignId, name, type])
    const existing = await prisma.forgeItem.findFirst({
      where: { campaignId: campaignId ?? null, name, type },
      select: { id: true },
    });
    if (existing) {
      throw new Error(
        `Blueprint already exists for (campaign=${campaignId ?? 'global'}, type=${type}, name=${name}): ${existing.id}`,
      );
    }

    const item = await prisma.forgeItem.create({
      data: {
        type,
        name,
        data: dataJson,
        status: 'draft',
        campaignId: campaignId ?? null,
        isGlobal: !campaignId,
        createdBy: authorUserId,
        authorUserId,
      },
    });

    return {
      id: item.id,
      type: item.type,
      name: item.name,
      status: item.status,
      campaignId: item.campaignId,
      isGlobal: item.isGlobal,
      authorUserId: item.authorUserId,
      authoredBy: context.godHeadName,
    };
  },
});
