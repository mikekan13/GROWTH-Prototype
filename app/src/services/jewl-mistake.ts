/**
 * JEWL Mistake Bounty — Phase 1.
 *
 * When a GM catches JEWL making a mistake (bad challenge, wrong reaction,
 * factual error in an observation), they flag the offending CopilotMessage.
 * The flag debits JEWL's GodHead wallet and credits the GM's user wallet
 * via a JEWL_MISTAKE_BOUNTY KrmaTransaction. The corpus this builds is the
 * training signal JEWL eventually learns from across the network
 * (see [[jewl-is-the-interface-2026-06-15]]).
 *
 * Phase 1 = data model + service + endpoint. No UI; Phase 2 adds that.
 */

import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors';
import { executeTransaction } from './krma/ledger';
import { getJewlGodHead } from '@/ai/copilot/jewl-identity';
import { createUserWallet, getWalletByOwner } from './krma/wallet';
import { dispatchPrompt } from '@/ai/copilot/runtime';
import type { JewlPrompt } from '@/ai/copilot/prompts/types';

// ── Constants ──

/**
 * Severity → bounty amount in KRMA. Anchors per
 * [[jewl-is-the-interface-2026-06-15]]: bounty is trivial fraction of a
 * billion-tier wallet, so JEWL approaching perfection only slowly drains it.
 * These are starter values; tune later from the mistake corpus.
 */
export const JEWL_MISTAKE_BOUNTY_BY_SEVERITY = {
  minor: BigInt(10),
  major: BigInt(100),
  critical: BigInt(1000),
} as const;

export type JewlMistakeSeverity = keyof typeof JEWL_MISTAKE_BOUNTY_BY_SEVERITY;

/** Per-GM rate cap. Two windows, whichever applies. */
export const JEWL_MISTAKE_CAP_PER_SESSION = 5;
export const JEWL_MISTAKE_CAP_PER_24H = 5;

// ── Schema ──

export const flagJewlMistakeSchema = z.object({
  campaignId: z.string().min(1),
  copilotMessageId: z.string().min(1),
  gmUserId: z.string().min(1),
  severity: z.enum(['minor', 'major', 'critical']),
  note: z.string().max(1000).optional(),
});

export type FlagJewlMistakeInput = z.infer<typeof flagJewlMistakeSchema>;

// ── Result ──

export interface JewlMistakeRecord {
  id: string;
  campaignId: string;
  copilotMessageId: string;
  gmUserId: string;
  sessionId: string | null;
  severity: JewlMistakeSeverity;
  note: string;
  bountyAmount: bigint;
  transactionId: string;
  status: string;
  createdAt: Date;
}

// ── Helpers ──

/**
 * Return the currently-open GameSession for the campaign (highest number,
 * endedAt null). Null if no live session. Used for per-session cap counting
 * AND tagging the mistake row so we can build per-session analytics later.
 */
async function getActiveSessionId(campaignId: string): Promise<string | null> {
  const session = await prisma.gameSession.findFirst({
    where: { campaignId, endedAt: null },
    orderBy: { number: 'desc' },
    select: { id: true },
  });
  return session?.id ?? null;
}

/**
 * Cap enforcement: a GM can flag at most JEWL_MISTAKE_CAP_PER_SESSION mistakes
 * inside one active GameSession, OR JEWL_MISTAKE_CAP_PER_24H mistakes in a
 * rolling 24h window when no session is open. This is the anti-farm gate;
 * fancier validation (severity-graded review, append-only resolution loop)
 * is Phase 2.
 */
async function ensureUnderCap(params: {
  campaignId: string;
  gmUserId: string;
  activeSessionId: string | null;
}): Promise<void> {
  const { campaignId, gmUserId, activeSessionId } = params;

  if (activeSessionId) {
    const count = await prisma.jewlMistake.count({
      where: { sessionId: activeSessionId, gmUserId },
    });
    if (count >= JEWL_MISTAKE_CAP_PER_SESSION) {
      throw new ConflictError(
        `Per-session mistake cap reached (${JEWL_MISTAKE_CAP_PER_SESSION}). Flag JEWL again next session.`,
      );
    }
    return;
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.jewlMistake.count({
    where: { campaignId, gmUserId, createdAt: { gte: cutoff } },
  });
  if (count >= JEWL_MISTAKE_CAP_PER_24H) {
    throw new ConflictError(
      `24h mistake cap reached (${JEWL_MISTAKE_CAP_PER_24H}). Try again later.`,
    );
  }
}

// ── Core ──

/**
 * Flag a CopilotMessage as a JEWL mistake. Debits JEWL's wallet, credits
 * the GM's wallet, persists a JewlMistake row.
 *
 * Validation:
 *   - The CopilotMessage exists, role='assistant', belongs to this campaign.
 *   - The GM has access to the campaign (GM of record or campaign member).
 *   - Same GM hasn't already flagged this message (unique constraint).
 *   - Per-GM rate cap is not breached.
 *   - JEWL's wallet has the bounty.
 */
export async function flagJewlMistake(
  raw: FlagJewlMistakeInput,
): Promise<JewlMistakeRecord> {
  const input = flagJewlMistakeSchema.parse(raw);
  const bountyAmount = JEWL_MISTAKE_BOUNTY_BY_SEVERITY[input.severity];

  // Campaign + auth
  const campaign = await prisma.campaign.findUnique({
    where: { id: input.campaignId },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');

  const isGM = campaign.gmUserId === input.gmUserId;
  if (!isGM) {
    const member = await prisma.campaignMember.findUnique({
      where: {
        campaignId_userId: {
          campaignId: input.campaignId,
          userId: input.gmUserId,
        },
      },
    });
    if (!member) throw new ForbiddenError('Not a campaign member');
  }

  // Validate the target message
  const message = await prisma.copilotMessage.findUnique({
    where: { id: input.copilotMessageId },
    select: { id: true, role: true, campaignId: true },
  });
  if (!message) throw new NotFoundError('CopilotMessage not found');
  if (message.campaignId !== input.campaignId) {
    throw new ValidationError('Message does not belong to this campaign');
  }
  if (message.role !== 'assistant') {
    throw new ValidationError('Only JEWL (assistant) messages can be flagged');
  }

  // Unique constraint also enforces this — but pre-check gives a clean 409.
  const existing = await prisma.jewlMistake.findUnique({
    where: {
      copilotMessageId_gmUserId: {
        copilotMessageId: input.copilotMessageId,
        gmUserId: input.gmUserId,
      },
    },
  });
  if (existing) {
    throw new ConflictError('You have already flagged this JEWL message');
  }

  // Per-GM rate cap
  const activeSessionId = await getActiveSessionId(input.campaignId);
  await ensureUnderCap({
    campaignId: input.campaignId,
    gmUserId: input.gmUserId,
    activeSessionId,
  });

  // JEWL wallet
  const jewl = await getJewlGodHead();
  if (!jewl.walletId) {
    throw new ValidationError(
      'JEWL has no wallet; rerun: npx tsx scripts/seed-godheads.ts',
    );
  }

  // GM wallet — autocreate if missing (matches the patterns in lib/krma).
  let gmWallet;
  try {
    gmWallet = await getWalletByOwner(input.gmUserId);
  } catch {
    gmWallet = await createUserWallet(input.gmUserId);
  }

  // Move the KRMA.
  const idempotencyKey = `jewl-mistake:${input.copilotMessageId}:${input.gmUserId}`;
  const tx = await executeTransaction({
    fromWalletId: jewl.walletId,
    toWalletId: gmWallet.id,
    amount: bountyAmount,
    state: 'FLUID',
    reason: 'JEWL_MISTAKE_BOUNTY',
    description: `JEWL mistake bounty — ${input.severity}`,
    metadata: {
      campaignId: input.campaignId,
      copilotMessageId: input.copilotMessageId,
      severity: input.severity,
    },
    campaignId: input.campaignId,
    actorId: input.gmUserId,
    actorType: 'GM',
    idempotencyKey,
  });

  // Persist the row.
  const row = await prisma.jewlMistake.create({
    data: {
      campaignId: input.campaignId,
      copilotMessageId: input.copilotMessageId,
      gmUserId: input.gmUserId,
      sessionId: activeSessionId,
      severity: input.severity,
      note: input.note ?? '',
      bountyAmount,
      transactionId: tx.id,
      status: 'flagged',
    },
  });

  // Repair loop — fire-and-forget. JEWL is notified that the GM flagged him,
  // gets the offending message + severity + note, and responds in the chip.
  // His reply is the resolution (acknowledge / dispute / explain); the chat
  // thread IS the loop. Phase 3 will add a tool he can call to update the
  // mistake row's status (acknowledged/disputed) and write to his memory.
  void notifyJewlOfMistake({
    campaignId: input.campaignId,
    gmUserId: input.gmUserId,
    copilotMessageId: input.copilotMessageId,
    severity: input.severity,
    note: input.note,
    bountyAmount,
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.error('[jewl-mistake] dispatchPrompt failed:', err);
  });

  return {
    id: row.id,
    campaignId: row.campaignId,
    copilotMessageId: row.copilotMessageId,
    gmUserId: row.gmUserId,
    sessionId: row.sessionId,
    severity: row.severity as JewlMistakeSeverity,
    note: row.note,
    bountyAmount: row.bountyAmount,
    transactionId: row.transactionId,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/**
 * Fire-and-forget JEWL prompt notifying him of a mistake flag. He reads the
 * offending message + the GM's severity + note, and writes a reaction (own,
 * push back, explain) into the chip. The chat thread IS the resolution.
 */
async function notifyJewlOfMistake(params: {
  campaignId: string;
  gmUserId: string;
  copilotMessageId: string;
  severity: JewlMistakeSeverity;
  note?: string;
  bountyAmount: bigint;
}): Promise<void> {
  const [message, gm] = await Promise.all([
    prisma.copilotMessage.findUnique({
      where: { id: params.copilotMessageId },
      select: { content: true, createdAt: true },
    }),
    prisma.user.findUnique({
      where: { id: params.gmUserId },
      select: { username: true, role: true },
    }),
  ]);
  if (!message || !gm) return;

  const noteLine = params.note ? `\nGM note: ${params.note}` : '';
  const text = [
    `Your earlier message has been flagged as a mistake.`,
    `Severity: ${params.severity} — bounty ${params.bountyAmount.toString()} KRMA debited from your wallet.`,
    `Flagged content (${message.createdAt.toISOString()}):`,
    `"${message.content.slice(0, 800)}"${noteLine}`,
    ``,
    `Reply once in the chip — acknowledge, dispute with reasoning, or explain. Keep it terse. If you genuinely missed something, own it. If the GM is wrong, push back; your wallet is real but so is the truth.`,
  ].join('\n');

  const prompt: JewlPrompt = {
    source: 'GM_MISTAKE_FLAG',
    campaignId: params.campaignId,
    actorId: params.gmUserId,
    actorName: gm.username,
    actorRole: gm.role,
    text,
  };

  await dispatchPrompt(prompt);
}

// ── Listing (light Phase 2 prep) ──

export async function listJewlMistakesForCampaign(
  campaignId: string,
  limit = 50,
): Promise<JewlMistakeRecord[]> {
  const rows = await prisma.jewlMistake.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaignId,
    copilotMessageId: row.copilotMessageId,
    gmUserId: row.gmUserId,
    sessionId: row.sessionId,
    severity: row.severity as JewlMistakeSeverity,
    note: row.note,
    bountyAmount: row.bountyAmount,
    transactionId: row.transactionId,
    status: row.status,
    createdAt: row.createdAt,
  }));
}
