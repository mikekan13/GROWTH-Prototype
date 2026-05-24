import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError } from '@/lib/errors';
import { createSubscription } from '@/services/subscription';

export const dynamic = 'force-dynamic';

/**
 * Dev / pre-Stripe stub checkout. Skips the actual Stripe checkout session
 * entirely and creates the Subscription row directly with the lump
 * allocation — same code path Stripe's checkout.session.completed webhook
 * would trigger.
 *
 * Hard-guarded: refuses when STRIPE_LIVE_MODE='true'. Once Stripe is wired
 * up for real, this endpoint becomes a 403.
 */
export async function POST() {
  try {
    const session = await requireAuth();

    if (process.env.STRIPE_LIVE_MODE === 'true') {
      throw new ForbiddenError('Stub checkout disabled — Stripe live mode is active. Use /api/billing/checkout-session.');
    }

    const result = await createSubscription(
      { userId: session.user.id, status: 'ACTIVE', plan: 'watcher_default' },
      session.user.id,
    );

    return NextResponse.json({
      ok: true,
      subscription: result.subscription ? {
        plan: result.subscription.plan,
        status: result.subscription.status,
      } : null,
      lumpTransactionId: result.lumpTransactionId,
      stubMode: true,
      message: result.lumpTransactionId
        ? 'Subscription activated — lump KRMA credited to wallet.'
        : 'Subscription already active; lump was previously credited.',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
