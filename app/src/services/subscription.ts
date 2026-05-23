/**
 * Subscription Service — manages a GM's Subscription row and runs the
 * monthly KRMA drip schedule defined in `services/subscription-drip.ts`.
 *
 * Lifecycle:
 *   1. Subscribe (free-tier or via Stripe webhook):
 *        createSubscription(userId) → status ACTIVE, lastDripMonthIndex=0,
 *        immediately allocates the SUBSCRIBE_LUMP into the GM's wallet.
 *   2. Run monthly drip (either cron-style scheduler OR admin trigger):
 *        runDripForUser(userId, now) — looks at lastDripAt vs now, runs
 *        any owed drips one by one. Idempotent: re-running on the same
 *        calendar month is a no-op.
 *   3. Status changes (PAST_DUE, CANCELED, FREE) — flip with
 *        setSubscriptionStatus(). PAST_DUE skips drips. CANCELED stops
 *        future drips but leaves the row in place for audit. FREE behaves
 *        like ACTIVE.
 *
 * Ledger:
 *   All KRMA transfers go through executeTransaction() with
 *   reason='GM_ALLOCATION'. Source is the Terminal reserve wallet
 *   (`SYSTEM_WALLETS.TERMINAL`). Destination is the user's wallet.
 *
 * Idempotency:
 *   Per-monthIndex idempotency key blocks double-pay. The DB row's
 *   lastDripMonthIndex column is the canonical "what's been paid"
 *   tracker; this service updates it inside the same transaction as
 *   the ledger write.
 *
 * Stripe coupling:
 *   This service has NO Stripe code. The webhook handler at
 *   /api/webhooks/stripe is the single integration point — it calls
 *   createSubscription / setSubscriptionStatus based on Stripe events.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isAdminRole } from '@/lib/permissions';
import { executeTransaction } from './krma/ledger';
import { getWalletByOwner, getReserveWallet } from './krma/wallet';
import { SUBSCRIBE_LUMP, monthlyDrip } from './subscription-drip';

// The Terminal reserve wallet funds every GM allocation. Label matches the
// genesis seed (`RESERVE_WALLETS.TERMINAL.label`). If beta rebrands this
// reserve, change the label here in one place.
const SUBSCRIPTION_RESERVE_LABEL = 'Terminal';

export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'FREE';

export const createSubscriptionSchema = z.object({
  userId: z.string().min(1),
  plan: z.string().default('watcher_default').optional(),
  status: z.enum(['ACTIVE', 'FREE']).default('ACTIVE').optional(),
  stripeCustomerId: z.string().optional(),
  stripeSubId: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// ── Subscription row CRUD ────────────────────────────────────────────────

/**
 * Create a Subscription row for a user (or return the existing one) and
 * allocate the lump-sum KRMA. Idempotent: re-running for an already-subscribed
 * user does NOT double-pay the lump.
 */
export async function createSubscription(
  input: z.infer<typeof createSubscriptionSchema>,
  actorId: string,
): Promise<{ subscription: Awaited<ReturnType<typeof prisma.subscription.findUnique>>; lumpTransactionId: string | null }> {
  const validated = createSubscriptionSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { id: validated.userId } });
  if (!user) throw new NotFoundError('User not found');

  // Reuse the existing subscription if one already exists.
  let sub = await prisma.subscription.findUnique({ where: { userId: validated.userId } });
  let lumpTxId: string | null = null;

  if (!sub) {
    sub = await prisma.subscription.create({
      data: {
        userId: validated.userId,
        plan: validated.plan ?? 'watcher_default',
        status: validated.status ?? 'ACTIVE',
        stripeCustomerId: validated.stripeCustomerId,
        stripeSubId: validated.stripeSubId,
        notes: validated.notes,
      },
    });
    // Lump-sum allocation is fired exactly once per subscription row. The
    // idempotency key includes sub.id so that a cancel→resubscribe (a new
    // Subscription row) re-pays the lump rather than aliasing to the
    // previous row's cached transaction.
    lumpTxId = await allocateSubscribeLump(validated.userId, sub.id, actorId);
  }

  return { subscription: sub, lumpTransactionId: lumpTxId };
}

export async function setSubscriptionStatus(userId: string, status: SubscriptionStatus): Promise<void> {
  await prisma.subscription.update({
    where: { userId },
    data: { status },
  });
}

export async function getSubscription(userId: string) {
  return prisma.subscription.findUnique({ where: { userId } });
}

// ── Drip execution ───────────────────────────────────────────────────────

/**
 * Run any drip months that are owed to this user. Returns the list of
 * transactions executed; empty array if nothing was owed (idempotent).
 *
 * Month indexing: the calendar uses the subscribedAt anchor. Month 1
 * starts at subscribedAt + 1 month and so on. If a user subscribed
 * 3 months ago and lastDripMonthIndex is 0, this catches them up — fires
 * months 1, 2, 3 in order.
 *
 * Pass `now` for tests / time travel. Defaults to Date.now().
 */
export async function runDripForUser(
  userId: string,
  actorId: string,
  now: Date = new Date(),
): Promise<{ executed: Array<{ monthIndex: number; amount: number; transactionId: string }> }> {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub) return { executed: [] };
  if (sub.status !== 'ACTIVE' && sub.status !== 'FREE') return { executed: [] };

  const elapsedMonths = monthsBetween(sub.subscribedAt, now);
  if (elapsedMonths <= sub.lastDripMonthIndex) return { executed: [] };

  const reserveWallet = await getReserveWallet(SUBSCRIPTION_RESERVE_LABEL);
  const userWallet = await getWalletByOwner(userId);

  const executed: Array<{ monthIndex: number; amount: number; transactionId: string }> = [];
  for (let m = sub.lastDripMonthIndex + 1; m <= elapsedMonths; m++) {
    const amount = monthlyDrip(m);
    if (amount <= 0) continue;
    const tx = await executeTransaction({
      fromWalletId: reserveWallet.id,
      toWalletId: userWallet.id,
      amount: BigInt(amount),
      state: 'FLUID',
      reason: 'GM_ALLOCATION',
      description: `Subscription drip — month ${m}`,
      metadata: { userId, monthIndex: m, subscribedAt: sub.subscribedAt.toISOString() },
      actorId,
      actorType: 'SYSTEM',
      idempotencyKey: `sub-drip::${userId}::${m}`,
    });
    executed.push({ monthIndex: m, amount, transactionId: tx.id });
    await prisma.subscription.update({
      where: { userId },
      data: { lastDripMonthIndex: m, lastDripAt: now },
    });
  }

  return { executed };
}

/**
 * Run drips for every ACTIVE/FREE subscription. Returns aggregated stats.
 * Intended for the cron path; admin endpoint calls this too.
 */
export async function runDripForAll(actorId: string, now: Date = new Date()) {
  const subs = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'FREE'] } },
    select: { userId: true },
  });
  let totalDrips = 0;
  let totalKrma = 0;
  const errors: Array<{ userId: string; error: string }> = [];
  for (const s of subs) {
    try {
      const result = await runDripForUser(s.userId, actorId, now);
      totalDrips += result.executed.length;
      totalKrma += result.executed.reduce((sum, e) => sum + e.amount, 0);
    } catch (err) {
      errors.push({ userId: s.userId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { subscriptionCount: subs.length, totalDrips, totalKrma, errors };
}

// ── Internal helpers ─────────────────────────────────────────────────────

async function allocateSubscribeLump(userId: string, subscriptionId: string, actorId: string): Promise<string> {
  const reserveWallet = await getReserveWallet(SUBSCRIPTION_RESERVE_LABEL);
  const userWallet = await getWalletByOwner(userId);
  const tx = await executeTransaction({
    fromWalletId: reserveWallet.id,
    toWalletId: userWallet.id,
    amount: BigInt(SUBSCRIBE_LUMP),
    state: 'FLUID',
    reason: 'GM_ALLOCATION',
    description: 'Subscription — initial lump-sum allocation',
    metadata: { userId, subscriptionId, kind: 'subscribe_lump' },
    actorId,
    actorType: 'SYSTEM',
    idempotencyKey: `sub-lump::${subscriptionId}`,
  });
  return tx.id;
}

/**
 * Whole calendar months elapsed from `from` to `to`. Uses Date arithmetic:
 * if `to` lands on or past the same day-of-month at `from + N months`,
 * we credit month N.
 */
function monthsBetween(from: Date, to: Date): number {
  if (to.getTime() < from.getTime()) return 0;
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

// ── Admin guard ──────────────────────────────────────────────────────────

export function requireAdminOrThrow(userId: string, userRole: string): void {
  if (!isAdminRole(userRole)) {
    throw new ForbiddenError('Only admins can trigger subscription operations');
  }
  // userId reserved for future audit logging — explicit suppression so
  // TS doesn't complain about unused param.
  void userId;
}

// Re-export for the webhook layer's convenience.
export { ValidationError, SUBSCRIBE_LUMP };
