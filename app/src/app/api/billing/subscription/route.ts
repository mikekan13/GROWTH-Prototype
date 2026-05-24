import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { getSubscription } from '@/services/subscription';
import { SUBSCRIBE_LUMP, monthlyDrip } from '@/services/subscription-drip';

export const dynamic = 'force-dynamic';

/**
 * Authenticated user's subscription summary: status, drip progress, current
 * KRMA wallet balance, and the static beta pricing surface (lump + month-1
 * drip) so the UI can render without a second call.
 */
export async function GET() {
  try {
    const session = await requireAuth();
    const [sub, wallet] = await Promise.all([
      getSubscription(session.user.id),
      prisma.wallet.findUnique({ where: { ownerId: session.user.id } }),
    ]);

    return NextResponse.json({
      subscription: sub ? {
        plan: sub.plan,
        status: sub.status,
        subscribedAt: sub.subscribedAt.toISOString(),
        lastDripAt: sub.lastDripAt?.toISOString() ?? null,
        lastDripMonthIndex: sub.lastDripMonthIndex,
        stripeSubId: sub.stripeSubId ?? null,
        notes: sub.notes ?? null,
      } : null,
      wallet: wallet ? { balance: wallet.balance.toString() } : null,
      pricing: {
        plan: 'watcher_default',
        currency: 'USD',
        // Beta stub: surfaces a default price even when Stripe isn't set up.
        // Real pricing comes from Stripe products once live.
        monthlyPriceUSD: Number(process.env.STRIPE_WATCHER_PRICE_USD ?? 12),
        krmaLumpOnSubscribe: SUBSCRIBE_LUMP,
        krmaMonth1Drip: monthlyDrip(1),
        seats: 5,
      },
      stubMode: !process.env.STRIPE_LIVE_MODE || process.env.STRIPE_LIVE_MODE !== 'true',
    });
  } catch (error) {
    return errorResponse(error);
  }
}
