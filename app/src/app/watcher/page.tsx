import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';
import Link from 'next/link';
import CampaignCreator from '@/components/CampaignCreator';

function formatKrma(n: bigint): string {
  return Number(n).toLocaleString();
}

export default async function WatcherDashboard() {
  const session = await getSession();
  if (!session) redirect('/');

  const [campaigns, personalWallet] = await Promise.all([
    prisma.campaign.findMany({
      where: { gmUserId: session.user.id },
      include: {
        _count: { select: { characters: true, members: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.wallet.findUnique({ where: { ownerId: session.user.id } }),
  ]);

  const campaignIds = campaigns.map(c => c.id);
  const campaignWallets = campaignIds.length > 0
    ? await prisma.wallet.findMany({
        where: { walletType: 'CAMPAIGN', campaignId: { in: campaignIds } },
      })
    : [];

  const campaignWalletMap = new Map(campaignWallets.map(w => [w.campaignId!, w.balance]));
  const totalInCampaigns = campaignWallets.reduce((sum, w) => sum + w.balance, BigInt(0));
  const personalBalance = personalWallet?.balance ?? BigInt(0);

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div className="section-badge inline-block">
            Watcher Console
          </div>
          <div className="flex gap-3">
            <Link
              href="/watcher/characters/new"
              className="px-4 py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] text-xs uppercase tracking-wider hover:bg-[var(--surface-dark)]/90"
            >
              New Character
            </Link>
          </div>
        </div>

        {/* KRMA Pool — rulebook style */}
        <div className="space-y-3">
          {/* Hero readout */}
          <div className="flex items-center gap-0">
            <div
              className="px-5 py-2 flex items-center gap-3"
              style={{ background: 'linear-gradient(90deg, #D4A830, #E8C848, #D4A830)' }}
            >
              <span
                className="uppercase leading-none"
                style={{ fontFamily: '"Bebas Neue", Impact, sans-serif', fontSize: '32px', color: '#582a72', fontWeight: 'bold', letterSpacing: '-0.01em' }}
              >
                {formatKrma(personalBalance + totalInCampaigns)}
              </span>
              <span className="leading-none" style={{ fontSize: '28px', color: '#582a72', fontWeight: 'bold', letterSpacing: '0.02em' }}>
                <span style={{ fontFamily: 'var(--font-inknut-antiqua), "Inknut Antiqua", serif', fontSize: '22px', fontWeight: 900 }}>Ҝ</span>
                <span style={{ fontFamily: '"Bebas Neue", Impact, sans-serif' }}>RMA</span>
              </span>
            </div>
            <div
              className="h-[48px] min-w-[48px] px-3 flex flex-col items-center justify-center"
              style={{ background: '#582a72' }}
            >
              <span className="text-white text-[14px] font-bold whitespace-nowrap" style={{ fontFamily: 'Consolas, monospace' }}>{formatKrma(personalBalance)}</span>
              <span className="text-white/50 text-[7px] tracking-[0.1em]" style={{ fontFamily: 'Consolas, monospace' }}>SELF</span>
            </div>
            <div
              className="h-[48px] flex items-center"
              style={{ background: '#E8585A' }}
            >
              <div className="flex flex-col items-center justify-center px-3">
                <span className="text-white text-[14px] font-bold whitespace-nowrap" style={{ fontFamily: 'Consolas, monospace' }}>{formatKrma(totalInCampaigns)}</span>
                <span className="text-white/50 text-[7px] tracking-[0.1em]" style={{ fontFamily: 'Consolas, monospace' }}>CAMP</span>
              </div>
              <span className="text-white font-bold text-[28px] leading-none pr-1.5" style={{ fontFamily: 'Consolas, monospace' }}>]</span>
            </div>
          </div>

          {/* Per-campaign breakdown */}
          {campaigns.length > 0 && (
            <div className="space-y-1">
              {campaigns.map(c => {
                const bal = campaignWalletMap.get(c.id) ?? BigInt(0);
                return (
                  <div key={c.id} className="flex items-center gap-0">
                    <div className="px-2 py-0.5" style={{ background: 'rgba(208, 160, 48, 0.15)' }}>
                      <span className="text-[var(--accent-gold)] text-[11px] font-bold" style={{ fontFamily: 'Consolas, monospace' }}>{formatKrma(bal)}</span>
                    </div>
                    <div className="px-2 py-0.5" style={{ background: 'rgba(88, 42, 114, 0.15)' }}>
                      <span className="text-white/60 text-[10px]" style={{ fontFamily: 'Consolas, monospace' }}>{c.name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Campaigns */}
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/40 mb-3">Your Campaigns</div>
          {campaigns.length === 0 ? (
            <div className="highlight-bar">
              No campaigns yet. Create one below to begin watching.
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map(c => (
                <Link
                  key={c.id}
                  href={`/watcher/campaign/${c.id}`}
                  className="flex items-center justify-between p-3 bg-white/40 border border-[var(--surface-dark)]/10 hover:bg-white/60 transition-colors no-underline"
                >
                  <div>
                    <span className="font-bold">{c.name}</span>
                    {c.genre && <span className="text-xs text-[var(--surface-dark)]/40 ml-2">{c.genre}</span>}
                    <div className="text-xs text-[var(--surface-dark)]/40 mt-0.5">
                      {c._count.characters} characters | {c._count.members} trailblazers | Invite: {c.inviteCode}
                    </div>
                  </div>
                  <span className="text-xs uppercase tracking-wider text-[var(--accent-teal)]">{c.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <CampaignCreator />
      </div>
    </DashboardShell>
  );
}
