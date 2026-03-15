import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';
import JoinCampaign from '@/components/JoinCampaign';
import RedeemCode from '@/components/RedeemCode';
import Link from 'next/link';

export default async function TrailblazerDashboard() {
  const session = await getSession();
  if (!session) redirect('/');

  // Get campaign memberships, characters, and applications
  const [memberships, characters] = await Promise.all([
    prisma.campaignMember.findMany({
      where: { userId: session.user.id },
      include: {
        campaign: { select: { id: true, name: true, genre: true, status: true } },
        application: { select: { status: true } },
      },
      orderBy: { joinedAt: 'desc' },
    }),
    prisma.character.findMany({
      where: { userId: session.user.id },
      include: {
        campaign: { select: { name: true } },
        backstory: { select: { status: true } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  // Campaigns where player has membership but no character yet
  const characterCampaignIds = new Set(characters.map(c => c.campaignId));
  const pendingCampaigns = memberships.filter(m => !characterCampaignIds.has(m.campaignId));

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="section-badge inline-block">
          Trailblazer Portal
        </div>

        {/* Campaigns needing application / character creation */}
        {pendingCampaigns.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--accent-gold)] mb-3">
              Campaign Applications
            </div>
            <div className="space-y-2">
              {pendingCampaigns.map(m => {
                const appStatus = m.application?.status;
                return (
                  <div key={m.id} className="flex items-center justify-between p-3 bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30">
                    <div>
                      <span className="font-bold">{m.campaign.name}</span>
                      {m.campaign.genre && (
                        <span className="text-xs text-[var(--surface-dark)]/40 ml-2">{m.campaign.genre}</span>
                      )}
                      {appStatus && (
                        <span className={`text-[10px] uppercase tracking-wider ml-2 ${
                          appStatus === 'SUBMITTED' ? 'text-[var(--krma-gold)]'
                          : appStatus === 'APPROVED' ? 'text-[var(--accent-teal)]'
                          : appStatus === 'REVISION' ? 'text-[var(--accent-coral)]'
                          : appStatus === 'DENIED' ? 'text-red-500'
                          : 'text-[var(--surface-dark)]/40'
                        }`}>
                          {appStatus}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {(!appStatus || appStatus === 'DRAFT' || appStatus === 'REVISION') && (
                        <Link
                          href={`/campaign/${m.campaign.id}/apply`}
                          className="text-xs text-[var(--accent-teal)] hover:underline"
                        >
                          {!appStatus ? 'Begin Application' : appStatus === 'REVISION' ? 'Revise Application' : 'Continue Application'}
                        </Link>
                      )}
                      {appStatus === 'SUBMITTED' && (
                        <span className="text-xs text-[var(--surface-dark)]/40">
                          Under review
                        </span>
                      )}
                      {appStatus === 'APPROVED' && (
                        <span className="text-xs text-[var(--accent-teal)]">
                          Approved — awaiting character
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Characters */}
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/40 mb-3">
            Your Characters ({characters.length})
          </div>

          {characters.length === 0 && pendingCampaigns.length === 0 ? (
            <div className="highlight-bar">
              No characters yet. Join a campaign to begin your journey.
            </div>
          ) : characters.length === 0 ? null : (
            <div className="space-y-2">
              {characters.map(char => (
                <div key={char.id} className="flex items-center justify-between p-3 bg-white/40 border border-[var(--surface-dark)]/10">
                  <div>
                    <Link href={`/character/${char.id}`} className="font-bold text-[var(--surface-dark)] hover:underline">
                      {char.name}
                    </Link>
                    <span className="text-xs text-[var(--surface-dark)]/40 ml-2">
                      in {char.campaign.name}
                    </span>
                    {char.backstory && (
                      <span className={`text-[10px] uppercase tracking-wider ml-2 ${
                        char.backstory.status === 'APPROVED' ? 'text-[var(--accent-teal)]'
                        : char.backstory.status === 'REVISION' ? 'text-[var(--accent-coral)]'
                        : char.backstory.status === 'SUBMITTED' ? 'text-[var(--krma-gold)]'
                        : 'text-[var(--surface-dark)]/40'
                      }`}>
                        Backstory: {char.backstory.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {(!char.backstory || char.backstory.status === 'DRAFT' || char.backstory.status === 'REVISION') && (
                      <Link
                        href={`/character/${char.id}/backstory`}
                        className="text-xs text-[var(--accent-teal)] hover:underline"
                      >
                        {char.backstory ? 'Edit Backstory' : 'Write Backstory'}
                      </Link>
                    )}
                    <span className={`text-xs uppercase tracking-wider ${
                      char.status === 'ACTIVE' ? 'text-[var(--accent-teal)]'
                      : char.status === 'DRAFT' ? 'text-[var(--surface-dark)]/40'
                      : 'text-[var(--accent-coral)]'
                    }`}>
                      {char.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Browse Campaigns */}
        <div className="p-4 bg-[var(--accent-teal)]/5 border border-[var(--accent-teal)]/20 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-[var(--surface-dark)]">{'EŶ∃tehrNET'}</div>
            <div className="text-xs text-[var(--surface-dark)]/40">Browse open campaigns and apply</div>
          </div>
          <Link
            href="/hub"
            className="px-4 py-1.5 bg-[var(--accent-teal)] text-white text-xs font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:bg-[var(--accent-teal)]/80 transition-colors"
          >
            Browse Campaigns
          </Link>
        </div>

        <JoinCampaign />

        <RedeemCode />
      </div>
    </DashboardShell>
  );
}
