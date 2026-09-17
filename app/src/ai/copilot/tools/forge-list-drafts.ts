/**
 * list_forge_drafts — JEWL enumerates the Forge queue for his campaign.
 *
 * Born from the round-5 Violet review (2026-08-25): the GM said "deny all
 * the drafts except [R11]" and JEWL could not act — withdraw_draft needs
 * internal ids, and ids from earlier sessions are gone from his context.
 * He could see nothing, so he guessed at queue state and guessed wrong.
 *
 * Read-only by design. Approval/denial of drafts is a GM-consent action
 * (KRMA is valued) — JEWL never gets an approve/deny tool; the GM acts
 * through the Forge panel. This tool only restores sight, plus the ids
 * needed for withdraw_draft on his own drafts.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getJewlGodHead } from '../jewl-identity';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  statuses: z.array(z.enum(['draft', 'superseded', 'published'])).min(1).optional().describe(
    "Which statuses to list. Defaults to ['draft'] — the live review queue.",
  ),
  type: z.enum(['root', 'branch', 'nectar', 'thorn', 'blossom', 'skill', 'item']).optional().describe(
    'Optional filter to one forge item type.',
  ),
});

export const listForgeDraftsTool: JewlTool = {
  name: 'list_forge_drafts',
  description:
    "List this campaign's Forge queue: id, name, type, status, author, " +
    'and last-updated for each item (drafts by default). Use it to see ' +
    'what actually sits in the queue instead of relying on memory, and to ' +
    'get the ids withdraw_draft needs. NOTE: you cannot approve or deny ' +
    'drafts — that is the GM\'s consent action in the Forge panel; if the ' +
    'GM asks you to clear items you authored, withdraw them by id.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input ?? {});
    const jewl = await getJewlGodHead();

    const items = await prisma.forgeItem.findMany({
      where: {
        campaignId: ctx.campaignId,
        status: { in: parsed.statuses ?? ['draft'] },
        ...(parsed.type ? { type: parsed.type } : {}),
      },
      select: { id: true, name: true, type: true, status: true, authorUserId: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });

    return {
      output: {
        count: items.length,
        items: items.map(i => ({
          id: i.id,
          name: i.name,
          type: i.type,
          status: i.status,
          mine: i.authorUserId === jewl.characterUserId,
          updatedAt: i.updatedAt.toISOString(),
        })),
      },
    };
  },
};

registerJewlTool(listForgeDraftsTool);
