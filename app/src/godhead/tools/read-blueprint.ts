/**
 * read_blueprint — Full detail on one ForgeItem including parsed data JSON.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  forgeItemId: z.string().describe('The ForgeItem ID to read'),
});

registerTool({
  name: 'read_blueprint',
  description: 'Read full blueprint detail: type, data (parsed), karmic value, decay state, relationship tags, authorship, and use history.',
  inputSchema,
  handler: async (input) => {
    const { forgeItemId } = input as z.infer<typeof inputSchema>;

    const item = await prisma.forgeItem.findUnique({
      where: { id: forgeItemId },
      include: { campaign: { select: { id: true, name: true } } },
    });
    if (!item) throw new Error(`Blueprint not found: ${forgeItemId}`);

    let data: unknown;
    try {
      data = JSON.parse(item.data);
    } catch {
      data = item.data;
    }

    let relationshipTags: unknown = null;
    if (item.relationshipTags) {
      try {
        relationshipTags = JSON.parse(item.relationshipTags);
      } catch {
        relationshipTags = item.relationshipTags;
      }
    }

    return {
      id: item.id,
      type: item.type,
      name: item.name,
      status: item.status,
      data,

      campaignId: item.campaignId,
      campaignName: item.campaign?.name ?? null,
      isGlobal: item.isGlobal,
      sourceGlobalId: item.sourceGlobalId,

      createdBy: item.createdBy,
      authorUserId: item.authorUserId,

      useCount: item.useCount,
      royaltyRate: item.royaltyRate,

      decayStatus: item.decayStatus,
      lastUsedAt: item.lastUsedAt?.toISOString() ?? null,
      flaggedAt: item.flaggedAt?.toISOString() ?? null,

      karmicValue: item.karmicValue?.toString() ?? null,
      evaluatedAt: item.evaluatedAt?.toISOString() ?? null,
      relationshipTags,

      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  },
});
