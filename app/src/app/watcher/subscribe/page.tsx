import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getSubscription } from '@/services/subscription';
import { SUBSCRIBE_LUMP, monthlyDrip } from '@/services/subscription-drip';
import DashboardShell from '@/components/DashboardShell';
import SubscribeForm from '@/components/billing/SubscribeForm';

export const dynamic = 'force-dynamic';

const STUB_MODE = process.env.STRIPE_LIVE_MODE !== 'true';
const MONTHLY_USD = Number(process.env.STRIPE_WATCHER_PRICE_USD ?? 12);

export default async function SubscribePage() {
  const session = await getSession();
  if (!session) redirect('/');

  const [sub, wallet] = await Promise.all([
    getSubscription(session.user.id),
    prisma.wallet.findUnique({ where: { ownerId: session.user.id } }),
  ]);

  const lumpKRMA = SUBSCRIBE_LUMP.toLocaleString();
  const month1KRMA = monthlyDrip(1).toLocaleString();
  const balance = wallet?.balance.toString() ?? '0';

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <header className="space-y-2">
          <div className="text-[12px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase text-[#22ab94]">
            EŶ∃tehrNET · Subscription
          </div>
          <h1 className="text-3xl font-[family-name:var(--font-header)] tracking-[0.12em] text-[#F5F4EF]">
            Watcher · 5-seat Campaign
          </h1>
          <p className="text-[14px] text-white/60 font-[family-name:var(--font-terminal)] leading-relaxed">
            Subscribe to allocate a Watcher KRMA pool, host campaigns, and invite up to
            5 Trailblazers per campaign.
          </p>
        </header>

        {/* Status panel */}
        <section className="border p-4 space-y-2"
          style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.4)' }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-[family-name:var(--font-terminal)] uppercase tracking-[0.15em] text-white/40">
              Your Status
            </span>
            <span className="text-[11px] font-[family-name:var(--font-terminal)] uppercase tracking-[0.15em]"
              style={{ color: sub?.status === 'ACTIVE' ? '#22ab94' : sub?.status === 'PAST_DUE' ? '#E8585A' : '#ffcc78' }}
            >
              {sub?.status ?? 'NO SUBSCRIPTION'}
            </span>
          </div>
          {sub && (
            <>
              <div className="flex justify-between text-[12px] font-[family-name:var(--font-terminal)] text-white/70">
                <span>Plan</span>
                <span>{sub.plan}</span>
              </div>
              <div className="flex justify-between text-[12px] font-[family-name:var(--font-terminal)] text-white/70">
                <span>Subscribed</span>
                <span>{new Date(sub.subscribedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between text-[12px] font-[family-name:var(--font-terminal)] text-white/70">
                <span>Months drip-credited</span>
                <span>{sub.lastDripMonthIndex}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-[12px] font-[family-name:var(--font-terminal)] pt-2 mt-1"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="text-white/70">KRMA Wallet</span>
            <span className="text-[14px] font-[family-name:var(--font-bebas-neue)] text-[#ffcc78]">
              {Number(balance).toLocaleString()} <span className="text-[11px]">Ҝ</span>
            </span>
          </div>
        </section>

        {/* Pricing card */}
        <section className="border p-5 space-y-3"
          style={{
            borderColor: 'rgba(255,204,120,0.4)',
            background: 'linear-gradient(135deg, rgba(255,204,120,0.06) 0%, rgba(0,0,0,0.5) 60%)',
          }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-[18px] font-[family-name:var(--font-header)] tracking-[0.15em] uppercase text-[#ffcc78]">
              Watcher Plan
            </span>
            <span className="text-[24px] font-[family-name:var(--font-bebas-neue)] text-[#ffcc78]">
              ${MONTHLY_USD}
              <span className="text-[12px] text-white/50 ml-1">/ month</span>
            </span>
          </div>
          <ul className="space-y-1.5 text-[13px] font-[family-name:var(--font-terminal)] text-white/70 leading-relaxed">
            <li>· <span className="text-[#ffcc78]">{lumpKRMA} Ҝ</span> immediate lump on subscribe</li>
            <li>· <span className="text-[#ffcc78]">{month1KRMA} Ҝ</span> KRMA drip month 1, scaling up to 10,000 Ҝ by month 12</li>
            <li>· Host unlimited campaigns; up to 5 Trailblazer seats per campaign</li>
            <li>· Access to GodHead invocations (Kai, Lady Death, Et&apos;herling)</li>
            <li>· Forge authoring pipeline + global content catalog</li>
            <li>· Cancel anytime — past-due grace period preserves your wallet</li>
          </ul>

          {STUB_MODE && (
            <div className="border-t pt-3 mt-3"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] text-[#ffcc78] mb-2">
                ⚠ DEV STUB MODE
              </div>
              <p className="text-[11px] text-white/40 font-[family-name:var(--font-terminal)] leading-relaxed mb-3">
                Stripe is not yet wired. The Subscribe button below activates a real
                Subscription row + KRMA lump in the database, but no payment is taken.
                Real Stripe checkout will replace this surface when STRIPE_LIVE_MODE=true.
              </p>
            </div>
          )}

          <SubscribeForm
            alreadySubscribed={!!sub && sub.status !== 'CANCELED'}
            currentStatus={sub?.status ?? null}
          />
        </section>

        <p className="text-[10px] text-white/30 font-[family-name:var(--font-terminal)] text-center">
          KRMA is the in-system currency for character authoring + GodHead invocation costs. It is NOT a real-world investment vehicle — see ToS once published.
        </p>
      </div>
    </DashboardShell>
  );
}
