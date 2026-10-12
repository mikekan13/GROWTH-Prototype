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
import { withdrawForgeDraft } from '@/services/forge-withdraw';
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
    // Shared path (services/forge-withdraw.ts) — the GM's redraft uses it too.
    const item = await withdrawForgeDraft({
      forgeItemId: parsed.forgeItemId,
      campaignId: ctx.campaignId,
      jewlUserId: jewl.characterUserId,
      reason: parsed.reason,
      by: 'JEWL',
    });
    return {
      output: { ...item, note: 'Withdrawn from the review queue; data retained.' },
    };
  },
};

registerJewlTool(withdrawDraftTool);
