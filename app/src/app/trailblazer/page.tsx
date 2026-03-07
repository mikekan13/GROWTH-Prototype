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

  // Get campaign memberships and characters
  const [memberships, characters] = await Promise.all([
    prisma.campaignMember.findMany({
      where: { userId: session.user.id },
      include: {
        campaign: { select: { id: true, name: true, genre: true, status: true } },
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

        {/* Campaigns needing character creation */}
        {pendingCampaigns.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--accent-gold)] mb-3">
              Awaiting Character Creation
            </div>
            <div className="space-y-2">
              {pendingCampaigns.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30">
                  <div>
                    <span className="font-bold">{m.campaign.name}</span>
                    {m.campaign.genre && (
                      <span className="text-xs text-[var(--surface-dark)]/40 ml-2">{m.campaign.genre}</span>
                    )}
                  </div>
                  <span className="text-xs text-[var(--surface-dark)]/40">
                    Joined — awaiting Watcher
                  </span>
                </div>
              ))}
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

        <JoinCampaign />

        <RedeemCode />
      </div>
    </DashboardShell>
  );
}
