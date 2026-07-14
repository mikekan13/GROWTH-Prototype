/**
 * update_mistake_status + query_mistake_corpus — JEWL's side of the bounty.
 *
 * Phase 1 stood up the bounty mechanic (GM flags → JEWL → GM KRMA + a
 * fire-and-forget GM_MISTAKE_FLAG prompt). Phase 2 wired the UI. This file
 * finishes the loop:
 *
 *   - `update_mistake_status` — JEWL responds to a flag by formally marking
 *     the JewlMistake row 'acknowledged' (he owns it) or 'disputed' (he
 *     pushes back). Memory tool stays available for the WHAT-he-learned;
 *     this records the JUDGMENT (own vs push back) alongside it.
 *
 *   - `query_mistake_corpus` — JEWL searches his own past flags GLOBALLY
 *     across every campaign. This is the "compounding learning" lever from
 *     [[jewl-is-the-interface-2026-06-15]]: a correction in one campaign
 *     becomes prior context next time the same pattern surfaces anywhere
 *     in the network.
 *
 * Together with `remember`/`forget` (the long-form memory) and the flag
 * lifecycle (status), this gives JEWL three tiers of learning storage:
 *   1. Per-mistake row    — the audit trail (immutable)
 *   2. Mistake status     — his judgment on each row (acknowledge/dispute)
 *   3. Persistent memory  — the patterns he derives (queryable next turn)
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerJewlTool } from './registry';
import { acceptMistake, disputeMistake } from '@/services/jewl-mistake';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

// ── update_mistake_status ──

const updateMistakeStatusSchema = z.object({
  mistakeId: z.string().min(1),
  status: z.enum(['acknowledged', 'disputed']),
  /** JEWL's response — the spoken-aloud reasoning. Surfaced to the GM. */
  response: z.string().min(1).max(2000),
});

export const updateMistakeStatusTool: JewlTool = {
  name: 'update_mistake_status',
  description:
    'After a GM_MISTAKE_FLAG prompt, resolve the flag. "acknowledged" = you ' +
    'own it: the pending bounty pays from your wallet to the GM. "disputed" = ' +
    'you push back: Et\'erling adjudicates and either upholds (bounty pays) or ' +
    'overturns (nothing moves). Response is your reasoning (one or two short ' +
    'sentences). Call this ONCE per flag, AFTER you have replied in the chip. ' +
    'The row must currently be "flagged" — re-marking is blocked so the audit ' +
    'trail stays clean.',
  inputSchema: updateMistakeStatusSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = updateMistakeStatusSchema.parse(input);

    // Both paths validate (exists, this-campaign, still 'flagged') in the
    // service; acceptance moves KRMA, dispute invokes Et'herling.
    const record =
      parsed.status === 'acknowledged'
        ? await acceptMistake({
            mistakeId: parsed.mistakeId,
            response: parsed.response,
            campaignId: ctx.campaignId,
          })
        : await disputeMistake({
            mistakeId: parsed.mistakeId,
            response: parsed.response,
            campaignId: ctx.campaignId,
          });

    return {
      output: {
        mistakeId: record.id,
        newStatus: record.status,
        resolution: record.resolution,
        bountyPaidKrma: record.transactionId ? record.bountyAmount.toString() : '0',
        response: parsed.response,
      },
    };
  },
};

// ── query_mistake_corpus ──

const queryMistakeCorpusSchema = z.object({
  /**
   * Substring filter against the GM note. Case-insensitive. If omitted,
   * returns the most recent flags across all campaigns (subject to limit).
   */
  match: z.string().max(200).optional(),
  /** Filter to a single severity. */
  severity: z.enum(['minor', 'major', 'critical']).optional(),
  /** Max rows to return. Hard ceiling 50. */
  limit: z.number().int().positive().max(50).default(20),
  /** Restrict to current campaign only. Default false → global corpus. */
  thisCampaignOnly: z.boolean().default(false),
});

export const queryMistakeCorpusTool: JewlTool = {
  name: 'query_mistake_corpus',
  description:
    'Search your own past mistake flags ACROSS ALL CAMPAIGNS (or just this ' +
    'one). Use this when a prompt smells like something you have seen before ' +
    'and you want to surface the prior correction. Returns each row with ' +
    'severity, GM note, your prior response (if resolved), and which campaign ' +
    'it came from. Cross-campaign learning is the network effect of the ' +
    'bounty system — your corrections compound globally. Default ' +
    'thisCampaignOnly=false (global), set true to scope down.',
  inputSchema: queryMistakeCorpusSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = queryMistakeCorpusSchema.parse(input);

    const where: {
      severity?: string;
      campaignId?: string;
      note?: { contains: string };
    } = {};
    if (parsed.severity) where.severity = parsed.severity;
    if (parsed.thisCampaignOnly) where.campaignId = ctx.campaignId;
    if (parsed.match && parsed.match.trim().length > 0) {
      where.note = { contains: parsed.match.trim() };
    }

    const rows = await prisma.jewlMistake.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parsed.limit,
      select: {
        id: true,
        campaignId: true,
        severity: true,
        note: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      output: {
        count: rows.length,
        scope: parsed.thisCampaignOnly ? 'this-campaign' : 'global',
        flags: rows.map(r => ({
          id: r.id,
          campaignId: r.campaignId,
          severity: r.severity,
          note: r.note,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        })),
      },
    };
  },
};

registerJewlTool(updateMistakeStatusTool);
registerJewlTool(queryMistakeCorpusTool);
