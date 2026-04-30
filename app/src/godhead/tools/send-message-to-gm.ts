/**
 * send_message_to_gm — Drop a note into the god-head ↔ GM channel for a campaign.
 *
 * Creates a GodHeadMessage row with direction=GODHEAD_TO_GM. The GM-facing UI
 * polls or subscribes to this table per-campaign; replies write a row with
 * direction=GM_TO_GODHEAD which feeds the next invocation's trigger context.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  campaignId: z.string().describe('Campaign the message belongs to. Verified to exist.'),
  content: z.string().min(1).describe('Message body. Plain text or JSON for structured payloads.'),
});

registerTool({
  name: 'send_message_to_gm',
  description: 'Send a message to the GM of a campaign on behalf of yourself. Use this for proposals, observations, requests, or status updates that the GM should see.',
  inputSchema,
  handler: async (input, context) => {
    const { campaignId, content } = input as z.infer<typeof inputSchema>;

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const message = await prisma.godHeadMessage.create({
      data: {
        godHeadId: context.godHeadId,
        campaignId,
        direction: 'GODHEAD_TO_GM',
        content,
        invocationId: context.invocationId,
      },
    });

    return {
      messageId: message.id,
      campaignId,
      direction: message.direction,
      createdAt: message.createdAt.toISOString(),
      sent: true,
    };
  },
});
