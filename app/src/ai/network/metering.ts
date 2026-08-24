/**
 * ai/network/metering — the unified per-call ledger.
 *
 * Every lane logs here (AiCall table): lane, model, tokens incl. CACHE
 * stats, estimated USD, campaign attribution. This is what makes per-GM
 * cost visible — the prerequisite for tier metering and margin tracking
 * (AI-ECONOMICS-2026-08-23.md §5). Writes are fire-and-forget: metering
 * must never break a dispatch.
 */

import 'server-only';
import { prisma } from '@/lib/db';
import type { AiUsage, LaneName, ProviderKind } from './types';

/** List prices per MILLION tokens. Cache read ≈ 0.1× input, write ≈ 1.25×. */
const PRICE_TABLE: Array<{ match: RegExp; inPerM: number; outPerM: number }> = [
  { match: /opus/i, inPerM: 5, outPerM: 25 },
  { match: /sonnet/i, inPerM: 3, outPerM: 15 },
  { match: /haiku/i, inPerM: 1, outPerM: 5 },
];

export function estimateUsd(model: string, usage: AiUsage): number {
  const row = PRICE_TABLE.find(p => p.match.test(model));
  if (!row) return 0; // local lane: token cost is GPU-time, priced separately
  const usd =
    (usage.inputTokens / 1e6) * row.inPerM +
    (usage.outputTokens / 1e6) * row.outPerM +
    (usage.cacheReadTokens / 1e6) * row.inPerM * 0.1 +
    (usage.cacheWriteTokens / 1e6) * row.inPerM * 1.25;
  return Math.round(usd * 1e6) / 1e6;
}

export interface RecordAiCallInput {
  lane: LaneName | string;
  provider: ProviderKind | string;
  model: string;
  caller: string;
  campaignId?: string | null;
  usage: AiUsage;
  sanitized?: boolean;
  meta?: Record<string, unknown>;
}

/** Fire-and-forget ledger write. Never throws. */
export function recordAiCall(input: RecordAiCallInput): void {
  void prisma.aiCall
    .create({
      data: {
        lane: String(input.lane),
        provider: String(input.provider),
        model: input.model,
        caller: input.caller,
        campaignId: input.campaignId ?? null,
        tokensIn: input.usage.inputTokens,
        tokensOut: input.usage.outputTokens,
        cacheReadTokens: input.usage.cacheReadTokens,
        cacheWriteTokens: input.usage.cacheWriteTokens,
        estUsd: estimateUsd(input.model, input.usage),
        sanitized: input.sanitized ?? false,
        meta: input.meta ? JSON.stringify(input.meta) : null,
      },
    })
    .catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[ai/network] metering write failed:', err);
    });
}
