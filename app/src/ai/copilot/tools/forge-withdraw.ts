/**
 * withdraw_draft — JEWL retracts his own superseded Forge drafts.
 *
 * Born from the round-4 Violet review (2026-08-25): JEWL iterated the root
 * six times, left every version in the queue, then blocked waiting for the
 * GM to clean up. He drafts; he should also be able to un-draft. Guard
 * rails: drafts only (never published), his own campaign, his own
 * authorship. Withdrawn rows keep their data (status='superseded') — they
 * are training corpus, not garbage.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getJewlGodHead } from '../jewl-identity';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  forgeItemId: z.string().min(1).max(64).describe(
    'The draft to withdraw (the id returned when you proposed it, or from the Forge panel).',
  ),
  reason: z.string().max(200).optional().describe(
    'Short reason, e.g. "superseded by [R9]". Recorded for the audit trail.',
  ),
});

export const withdrawDraftTool: JewlTool = {
  name: 'withdraw_draft',
  description:
    'Withdraw one of YOUR OWN Forge drafts (mark it superseded and remove it ' +
    'from the review queue). Use this when a revision replaces an earlier ' +
    'proposal — iterate internally, propose once, and withdraw anything the ' +
    'new version supersedes. Only works on drafts you authored in this ' +
    'campaign; published content is untouchable.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);
    const jewl = await getJewlGodHead();

    const item = await prisma.forgeItem.findUnique({
      where: { id: parsed.forgeItemId },
      select: { id: true, name: true, type: true, status: true, campaignId: true, authorUserId: true },
    });
    if (!item) throw new Error(`No forge item with id ${parsed.forgeItemId}`);
    if (item.campaignId !== ctx.campaignId) {
      throw new Error('Draft belongs to a different campaign — cannot withdraw.');
    }
    if (item.status !== 'draft') {
      throw new Error(`Only drafts can be withdrawn (this item is '${item.status}').`);
    }
    if (item.authorUserId !== jewl.characterUserId) {
      throw new Error('You can only withdraw drafts you authored.');
    }

    await prisma.forgeItem.update({
      where: { id: item.id },
      data: {
        status: 'superseded',
        relationshipTags: JSON.stringify({
          withdrawn: {
            by: 'JEWL',
            reason: parsed.reason ?? null,
            at: new Date().toISOString(),
          },
        }),
      },
    });

    return {
      output: {
        id: item.id,
        name: item.name,
        type: item.type,
        status: 'superseded',
        note: 'Withdrawn from the review queue; data retained.',
      },
    };
  },
};

registerJewlTool(withdrawDraftTool);
