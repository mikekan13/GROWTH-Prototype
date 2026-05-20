/**
 * Stripe Webhook — entry point for all subscription-billing events.
 *
 * Implements signature validation against STRIPE_WEBHOOK_SECRET. When the
 * secret is missing (dev / pre-Stripe-config), the endpoint accepts
 * unsigned payloads with a clear warning — so manual curl testing works
 * before Stripe is provisioned.
 *
 * Supported events (extend the dispatcher below as more land):
 *   - checkout.session.completed → createSubscription + lump allocation
 *   - customer.subscription.updated → status sync
 *   - customer.subscription.deleted → status CANCELED
 *   - invoice.paid                → optional: trigger drip catch-up
 *   - invoice.payment_failed      → status PAST_DUE
 *
 * Idempotency: Stripe retries webhooks aggressively. The downstream
 * service layer is idempotent (Subscription row is unique per user;
 * createSubscription is a no-op on existing rows; ledger transactions
 * use idempotencyKey). So duplicate webhook deliveries are safe.
 *
 * Why a hand-rolled signature check (no `stripe` npm dep): the only Stripe
 * surface we need today is signature validation. Adding the SDK doubles
 * cold-start time on Vercel/Fly for no gain. The official scheme is
 * documented and stable (HMAC-SHA256 over `${timestamp}.${body}` with
 * the webhook secret) — implementing it directly is ~30 lines.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { createSubscription, setSubscriptionStatus, runDripForUser } from '@/services/subscription';

export const dynamic = 'force-dynamic';

const SIGNATURE_TOLERANCE_SEC = 5 * 60;

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  created: number;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature');
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: StripeEvent;

    if (secret) {
      if (!signature) {
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
      }
      const verified = verifyStripeSignature(rawBody, signature, secret);
      if (!verified.valid) {
        return NextResponse.json({ error: verified.reason }, { status: 400 });
      }
      event = JSON.parse(rawBody) as StripeEvent;
    } else {
      // Dev mode — accept unsigned payloads with a warning. Production
      // deployments MUST set STRIPE_WEBHOOK_SECRET (CI should fail without it).
      // eslint-disable-next-line no-console
      console.warn('[stripe-webhook] STRIPE_WEBHOOK_SECRET not set — accepting unsigned payload. DO NOT run this way in production.');
      event = JSON.parse(rawBody) as StripeEvent;
    }

    return await handleEvent(event);
  } catch (error) {
    return errorResponse(error);
  }
}

// ── Event dispatcher ─────────────────────────────────────────────────────

async function handleEvent(event: StripeEvent): Promise<NextResponse> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event);
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(event);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event);
    case 'invoice.paid':
      return handleInvoicePaid(event);
    case 'invoice.payment_failed':
      return handlePaymentFailed(event);
    default:
      // Unhandled — ack with 200 so Stripe doesn't retry.
      return NextResponse.json({ ok: true, handled: false, type: event.type });
  }
}

// ── Event handlers ───────────────────────────────────────────────────────

async function handleCheckoutCompleted(event: StripeEvent): Promise<NextResponse> {
  const obj = event.data.object as { customer?: string; subscription?: string; client_reference_id?: string };
  // `client_reference_id` should carry our app's userId — set when we create the checkout session.
  const userId = obj.client_reference_id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'checkout.session missing client_reference_id' }, { status: 400 });
  }
  await createSubscription(
    {
      userId,
      status: 'ACTIVE',
      stripeCustomerId: obj.customer,
      stripeSubId: obj.subscription,
    },
    'SYSTEM',
  );
  return NextResponse.json({ ok: true, action: 'created' });
}

async function handleSubscriptionUpdated(event: StripeEvent): Promise<NextResponse> {
  const obj = event.data.object as { id: string; status: string; customer?: string };
  const sub = await prisma.subscription.findUnique({ where: { stripeSubId: obj.id } });
  if (!sub) return NextResponse.json({ ok: false, error: 'subscription not found' }, { status: 404 });
  const mapped =
    obj.status === 'active' || obj.status === 'trialing' ? 'ACTIVE' :
    obj.status === 'past_due' || obj.status === 'unpaid' ? 'PAST_DUE' :
    obj.status === 'canceled' ? 'CANCELED' :
    null;
  if (mapped) await setSubscriptionStatus(sub.userId, mapped);
  return NextResponse.json({ ok: true, action: 'updated', mapped });
}

async function handleSubscriptionDeleted(event: StripeEvent): Promise<NextResponse> {
  const obj = event.data.object as { id: string };
  const sub = await prisma.subscription.findUnique({ where: { stripeSubId: obj.id } });
  if (!sub) return NextResponse.json({ ok: false, error: 'subscription not found' }, { status: 404 });
  await setSubscriptionStatus(sub.userId, 'CANCELED');
  return NextResponse.json({ ok: true, action: 'canceled' });
}

async function handleInvoicePaid(event: StripeEvent): Promise<NextResponse> {
  // On successful renewal, catch the user up on any missed drip months.
  // The runDripForUser path is idempotent per monthIndex, so re-running
  // when nothing's owed is a safe no-op.
  const obj = event.data.object as { subscription?: string; customer?: string };
  if (!obj.subscription) return NextResponse.json({ ok: true, action: 'noop_no_subscription' });
  const sub = await prisma.subscription.findUnique({ where: { stripeSubId: obj.subscription } });
  if (!sub) return NextResponse.json({ ok: false, error: 'subscription not found' }, { status: 404 });
  const result = await runDripForUser(sub.userId, 'SYSTEM');
  return NextResponse.json({ ok: true, action: 'drip_run', executed: result.executed.length });
}

async function handlePaymentFailed(event: StripeEvent): Promise<NextResponse> {
  const obj = event.data.object as { subscription?: string };
  if (!obj.subscription) return NextResponse.json({ ok: true, action: 'noop' });
  const sub = await prisma.subscription.findUnique({ where: { stripeSubId: obj.subscription } });
  if (!sub) return NextResponse.json({ ok: false, error: 'subscription not found' }, { status: 404 });
  await setSubscriptionStatus(sub.userId, 'PAST_DUE');
  return NextResponse.json({ ok: true, action: 'past_due' });
}

// ── Signature verification ───────────────────────────────────────────────

function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): { valid: true } | { valid: false; reason: string } {
  // Stripe signature header format:
  //   t=<unix-timestamp>,v1=<hex-hmac>[,v0=<deprecated>]...
  const parts = Object.fromEntries(
    header.split(',').map(p => {
      const eq = p.indexOf('=');
      return eq === -1 ? [p, ''] : [p.slice(0, eq), p.slice(eq + 1)];
    })
  ) as Record<string, string>;

  const timestamp = parts.t;
  const signedHex = parts.v1;
  if (!timestamp || !signedHex) return { valid: false, reason: 'malformed signature header' };

  // Reject events older than tolerance — defends against replay attacks.
  const ts = parseInt(timestamp, 10);
  const ageSec = Math.floor(Date.now() / 1000) - ts;
  if (!Number.isFinite(ageSec) || Math.abs(ageSec) > SIGNATURE_TOLERANCE_SEC) {
    return { valid: false, reason: 'signature timestamp outside tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');

  // Constant-time comparison.
  const a = Buffer.from(signedHex, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { valid: false, reason: 'signature length mismatch' };
  if (!crypto.timingSafeEqual(a, b)) return { valid: false, reason: 'signature mismatch' };
  return { valid: true };
}
