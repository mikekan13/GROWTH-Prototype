/**
 * JEWL Mistake Bounty — mutual stewardship loop (T19, INV-121).
 *
 * When a GM catches JEWL erring (bad challenge, wrong reaction, factual slip
 * in an observation), they flag the offending CopilotMessage. That flag is a
 * *claim*, not a payout — NO KRMA moves yet. The claim then resolves one of
 * two ways:
 *
 *   - JEWL acknowledges  → he owns it; the bounty pays JEWL's GodHead wallet
 *                          → the GM's wallet (status 'acknowledged').
 *   - JEWL disputes      → the claim routes to Et'herling (the orchestrator
 *                          godhead) via the standard invocation path. She
 *                          adjudicates: 'upheld' pays the bounty, 'overturned'
 *                          pays nothing. Either way the row lands 'resolved'.
 *
 * The corpus this builds is the training signal JEWL learns from across the
 * network (see [[jewl-is-the-interface-2026-06-15]]). Every claim — paid or
 * not — stays on the row for cross-campaign recall (query_mistake_corpus).
 *
 * Bounty timing (Mike's ruling 2026-07-14): transfer-on-acceptance, matching
 * INV-121 ("when a GM *proves* an error"). The flag no longer pays optimistically.
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
import type { ActorType } from '@/types/krma';
import { getMistakeBountyAmount } from './economy-config';
import { getJewlGodHead } from '@/ai/copilot/jewl-identity';
import { createUserWallet, getWalletByOwner } from './krma/wallet';
import { dispatchPrompt } from '@/ai/copilot/runtime';
import type { JewlPrompt } from '@/ai/copilot/prompts/types';

// ── Constants ──

export type JewlMistakeSeverity = 'minor' | 'major' | 'critical';

/** Per-GM rate cap. Two windows, whichever applies. */
export const JEWL_MISTAKE_CAP_PER_SESSION = 5;
export const JEWL_MISTAKE_CAP_PER_24H = 5;

/** The godhead who adjudicates disputed flags (DB `GodHead.name`). */
export const ADJUDICATOR_GODHEAD_NAME = "Eth'erling";

/**
 * Rollback lever (Part D T19). Set MISTAKE_BOUNTY_ENABLED=false to disable the
 * whole loop — flagging, acceptance, and dispute all refuse. Default on.
 */
export function isMistakeBountyEnabled(): boolean {
  return process.env.MISTAKE_BOUNTY_ENABLED !== 'false';
}

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
  /** PENDING amount until paid; the promised bounty resolved at flag time. */
  bountyAmount: bigint;
  /** Null until the bounty actually pays (accepted, or dispute upheld). */
  transactionId: string | null;
  status: string;
  /** accepted | upheld | overturned; null while flagged/disputed. */
  resolution: string | null;
  /** GodHeadInvocation id of the Et'herling adjudication (dispute path only). */
  adjudicationInvocationId: string | null;
  createdAt: Date;
}

// ── Helpers ──

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
 * inside one active GameSession, OR JEWL_MISTAKE_CAP_PER_24H in a rolling 24h
 * window when no session is open. The anti-farm gate.
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

function toRecord(row: {
  id: string;
  campaignId: string;
  copilotMessageId: string;
  gmUserId: string;
  sessionId: string | null;
  severity: string;
  note: string;
  bountyAmount: bigint;
  transactionId: string | null;
  status: string;
  resolution: string | null;
  adjudicationInvocationId: string | null;
  createdAt: Date;
}): JewlMistakeRecord {
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
    resolution: row.resolution,
    adjudicationInvocationId: row.adjudicationInvocationId,
    createdAt: row.createdAt,
  };
}

/**
 * The ONE transfer path for a mistake bounty: JEWL's GodHead wallet → the GM's
 * wallet, for the row's pending amount. Used by both acceptance and an upheld
 * dispute. Returns the KrmaTransaction id. Idempotent per (mistakeId, kind).
 *
 * Exported so the Et'herling adjudication tool (`rule_jewl_mistake`) can reuse
 * it without duplicating ledger logic. Kept dependency-light so it does not
 * pull the godhead runtime into a cycle.
 */
export async function payMistakeBounty(params: {
  mistakeId: string;
  amount: bigint;
  gmUserId: string;
  campaignId: string;
  severity: JewlMistakeSeverity;
  kind: 'accept' | 'uphold';
  actorId: string;
  actorType: ActorType;
}): Promise<string> {
  const jewl = await getJewlGodHead();
  if (!jewl.walletId) {
    throw new ValidationError(
      'JEWL has no wallet; rerun: npx tsx scripts/seed-godheads.ts',
    );
  }

  let gmWallet;
  try {
    gmWallet = await getWalletByOwner(params.gmUserId);
  } catch {
    gmWallet = await createUserWallet(params.gmUserId);
  }

  const tx = await executeTransaction({
    fromWalletId: jewl.walletId,
    toWalletId: gmWallet.id,
    amount: params.amount,
    state: 'FLUID',
    reason: 'JEWL_MISTAKE_BOUNTY',
    description: `JEWL mistake bounty — ${params.severity} (${params.kind})`,
    metadata: {
      campaignId: params.campaignId,
      mistakeId: params.mistakeId,
      severity: params.severity,
      kind: params.kind,
    },
    campaignId: params.campaignId,
    actorId: params.actorId,
    actorType: params.actorType,
    idempotencyKey: `jewl-mistake:${params.kind}:${params.mistakeId}`,
  });

  return tx.id;
}

// ── Flag (records the claim; NO payout) ──

/**
 * Flag a CopilotMessage as a JEWL mistake. Records a JewlMistake row with the
 * PENDING bounty; no KRMA moves until JEWL resolves it. Fires a GM_MISTAKE_FLAG
 * prompt so JEWL can acknowledge (pays) or dispute (→ Et'herling).
 *
 * Validation:
 *   - The CopilotMessage exists, role='assistant', belongs to this campaign.
 *   - The GM has access to the campaign (GM of record or campaign member).
 *   - Same GM hasn't already flagged this message (unique constraint).
 *   - Per-GM rate cap is not breached.
 */
export async function flagJewlMistake(
  raw: FlagJewlMistakeInput,
): Promise<JewlMistakeRecord> {
  if (!isMistakeBountyEnabled()) {
    throw new ValidationError('Mistake bounty is disabled (MISTAKE_BOUNTY_ENABLED=false)');
  }

  const input = flagJewlMistakeSchema.parse(raw);
  const bountyAmount = await getMistakeBountyAmount(input.severity);

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

  // Persist the claim — no KRMA moves here (transfer-on-acceptance).
  const row = await prisma.jewlMistake.create({
    data: {
      campaignId: input.campaignId,
      copilotMessageId: input.copilotMessageId,
      gmUserId: input.gmUserId,
      sessionId: activeSessionId,
      severity: input.severity,
      note: input.note ?? '',
      bountyAmount,
      transactionId: null,
      status: 'flagged',
    },
  });

  // Notify JEWL — fire-and-forget. He reads the offending message + severity +
  // note and resolves via update_mistake_status (own → pays; dispute → Et'herling).
  void notifyJewlOfMistake({
    campaignId: input.campaignId,
    gmUserId: input.gmUserId,
    copilotMessageId: input.copilotMessageId,
    mistakeId: row.id,
    severity: input.severity,
    note: input.note,
    bountyAmount,
  }).catch(err => {
    // eslint-disable-next-line no-console
    console.error('[jewl-mistake] dispatchPrompt failed:', err);
  });

  return toRecord(row);
}

// ── Resolve: acknowledge (pays) ──

/**
 * JEWL owns the mistake. Pays the pending bounty JEWL→GM and marks the row
 * 'acknowledged'/'accepted'. Only a 'flagged' row can be accepted.
 *
 * `campaignId` (when given) scopes the row to the caller's campaign — the JEWL
 * tool passes its dispatch campaign so cross-campaign resolution is blocked.
 */
export async function acceptMistake(params: {
  mistakeId: string;
  response: string;
  campaignId?: string;
}): Promise<JewlMistakeRecord> {
  if (!isMistakeBountyEnabled()) {
    throw new ValidationError('Mistake bounty is disabled (MISTAKE_BOUNTY_ENABLED=false)');
  }

  const row = await loadFlaggedRow(params.mistakeId, params.campaignId);

  const transactionId = await payMistakeBounty({
    mistakeId: row.id,
    amount: row.bountyAmount,
    gmUserId: row.gmUserId,
    campaignId: row.campaignId,
    severity: row.severity as JewlMistakeSeverity,
    kind: 'accept',
    actorId: row.gmUserId,
    actorType: 'GM',
  });

  const updated = await prisma.jewlMistake.update({
    where: { id: row.id },
    data: {
      status: 'acknowledged',
      resolution: 'accepted',
      transactionId,
      note: mergeResponse(row.note, params.response, 'JEWL acknowledged'),
    },
  });

  return toRecord(updated);
}

// ── Resolve: dispute (→ Et'herling adjudicates) ──

/**
 * JEWL pushes back. Marks the row 'disputed', then invokes Et'herling through
 * the standard godhead path to adjudicate. She calls `rule_jewl_mistake`:
 * 'upheld' pays the bounty (GM proven right), 'overturned' pays nothing. The
 * tool finalizes the row to 'resolved'; this returns the row's final state.
 *
 * The Et'herling invocation is awaited so the ruling is settled when this
 * returns (rare path; disputes are exceptional). If the invocation throws, the
 * row stays 'disputed' and the caller sees that — a human can re-adjudicate.
 */
export async function disputeMistake(params: {
  mistakeId: string;
  response: string;
  campaignId?: string;
}): Promise<JewlMistakeRecord> {
  if (!isMistakeBountyEnabled()) {
    throw new ValidationError('Mistake bounty is disabled (MISTAKE_BOUNTY_ENABLED=false)');
  }

  const row = await loadFlaggedRow(params.mistakeId, params.campaignId);

  await prisma.jewlMistake.update({
    where: { id: row.id },
    data: {
      status: 'disputed',
      note: mergeResponse(row.note, params.response, 'JEWL disputes'),
    },
  });

  // Load the offending message so Et'herling can weigh the actual content.
  const message = await prisma.copilotMessage.findUnique({
    where: { id: row.copilotMessageId },
    select: { content: true },
  });

  // Dynamic import breaks the static cycle: the godhead runtime imports the
  // adjudication tool, which imports THIS module (payMistakeBounty).
  const { GodHeadAgent } = await import('@/godhead/agent');
  const agent = await GodHeadAgent.load(ADJUDICATOR_GODHEAD_NAME);

  await agent.invoke('jewl.mistake.dispute', {
    instruction:
      'JEWL disputes a mistake flag. You are the impartial adjudicator. Weigh ' +
      "the GM's claim against JEWL's rebuttal and the flagged content, then " +
      'rule by calling rule_jewl_mistake exactly once: ruling "upheld" if the ' +
      'GM proved the error (the bounty pays), "overturned" if JEWL was right ' +
      '(no bounty). Be fair; JEWL and the GM both have standing.',
    mistakeId: row.id,
    campaignId: row.campaignId,
    severity: row.severity,
    pendingBountyKrma: row.bountyAmount.toString(),
    gmNoteAndJewlRebuttal: mergeResponse(row.note, params.response, 'JEWL disputes'),
    flaggedMessageContent: (message?.content ?? '').slice(0, 2000),
  });

  // Et'herling's tool updated the row (adjudicationInvocationId, resolution,
  // status='resolved', transactionId if upheld). Re-read for the final truth.
  const final = await prisma.jewlMistake.findUnique({ where: { id: row.id } });
  if (!final) throw new NotFoundError('Mistake not found after adjudication');
  return toRecord(final);
}

async function loadFlaggedRow(mistakeId: string, campaignId?: string) {
  const row = await prisma.jewlMistake.findUnique({ where: { id: mistakeId } });
  if (!row) throw new NotFoundError('Mistake not found');
  if (campaignId && row.campaignId !== campaignId) {
    throw new ValidationError('Mistake does not belong to this campaign');
  }
  if (row.status !== 'flagged') {
    throw new ValidationError(
      `Mistake status is "${row.status}"; only "flagged" rows can be resolved`,
    );
  }
  return row;
}

/** Append JEWL's resolution response to the note with a clear marker. */
function mergeResponse(note: string, response: string, marker: string): string {
  const base = note.trim();
  const line = `${marker}: ${response.trim()}`;
  return base ? `${base}\n${line}` : line;
}

// ── Notify JEWL ──

async function notifyJewlOfMistake(params: {
  campaignId: string;
  gmUserId: string;
  copilotMessageId: string;
  mistakeId: string;
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

  // Test/kill seam: skip the live JEWL dispatch (e.g. e2e runs that must not
  // hit the Claude API or have JEWL auto-resolve the row mid-assertion).
  if (process.env.JEWL_DISABLE_DISPATCH === 'true') return;

  const noteLine = params.note ? `\nGM note: ${params.note}` : '';
  const text = [
    `Your earlier message has been flagged as a mistake.`,
    `Severity: ${params.severity} — a bounty of ${params.bountyAmount.toString()} KRMA is PENDING (mistake id ${params.mistakeId}). Nothing has moved yet.`,
    `Flagged content (${message.createdAt.toISOString()}):`,
    `"${message.content.slice(0, 800)}"${noteLine}`,
    ``,
    `Reply once in the chip, then call update_mistake_status ONCE with this mistake id: status "acknowledged" if you own it (the bounty pays from your wallet), or "disputed" if the GM is wrong (Et'herling will adjudicate). If you genuinely missed something, own it. If the GM is wrong, push back with reasoning.`,
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

// ── Listing ──

export async function listJewlMistakesForCampaign(
  campaignId: string,
  limit = 50,
): Promise<JewlMistakeRecord[]> {
  const rows = await prisma.jewlMistake.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(toRecord);
}
