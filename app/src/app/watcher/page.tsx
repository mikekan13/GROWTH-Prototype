import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';
import Link from 'next/link';
import CampaignCreator from '@/components/CampaignCreator';

export default async function WatcherDashboard() {
  const session = await getSession();
  if (!session) redirect('/');

  const campaigns = await prisma.campaign.findMany({
    where: { gmUserId: session.user.id },
    include: {
      _count: { select: { characters: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

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
                <div key={c.id} className="flex items-center justify-between p-3 bg-white/40 border border-[var(--surface-dark)]/10">
                  <div>
                    <span className="font-bold">{c.name}</span>
                    {c.genre && <span className="text-xs text-[var(--surface-dark)]/40 ml-2">{c.genre}</span>}
                    <div className="text-xs text-[var(--surface-dark)]/40 mt-0.5">
                      {c._count.characters} characters | Invite: {c.inviteCode}
                    </div>
                  </div>
                  <span className="text-xs uppercase tracking-wider text-[var(--accent-teal)]">{c.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <CampaignCreator />
      </div>
    </DashboardShell>
  );
}
