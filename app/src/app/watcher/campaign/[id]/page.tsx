import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canManageCampaign } from '@/lib/permissions';
import DashboardShell from '@/components/DashboardShell';
import Link from 'next/link';

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      characters: {
        include: {
          user: { select: { username: true } },
          backstory: { select: { status: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
      members: {
        include: {
          user: { select: { id: true, username: true } },
        },
        orderBy: { joinedAt: 'desc' },
      },
    },
  });

  if (!campaign) redirect('/watcher');
  if (!canManageCampaign(session.user.id, session.user.role, campaign)) redirect('/watcher');

  // Members who don't have a character yet
  const characterUserIds = new Set(campaign.characters.map(c => c.userId));
  const pendingMembers = campaign.members.filter(m => !characterUserIds.has(m.userId));

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Campaign Header */}
        <div className="flex items-start justify-between">
          <div>
            <Link href="/watcher" className="text-xs text-[var(--surface-dark)]/40 hover:text-[var(--surface-dark)]/60 uppercase tracking-wider">
              &larr; Watcher Console
            </Link>
            <h1 className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--surface-dark)] mt-1">
              {campaign.name}
            </h1>
            {campaign.genre && (
              <div className="text-sm text-[var(--surface-dark)]/40 mt-1">{campaign.genre}</div>
            )}
          </div>
          <div className="text-right space-y-1">
            <div className="flex gap-2 justify-end">
              <Link
                href={`/campaign/${campaign.id}`}
                className="inline-block px-3 py-1.5 bg-[var(--surface-dark)] text-[var(--accent-teal)] text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] border border-[var(--accent-teal)]/40 hover:bg-[var(--accent-teal)] hover:text-black transition-colors"
              >
                Open Campaign Canvas
              </Link>
              <Link
                href={`/watcher/campaign/${campaign.id}/settings`}
                className="inline-block px-3 py-1.5 bg-transparent text-[var(--surface-dark)]/60 text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] border border-[var(--surface-dark)]/20 hover:border-[var(--accent-teal)]/40 hover:text-[var(--accent-teal)] transition-colors"
              >
                Settings
              </Link>
            </div>
            <div className="text-xs uppercase tracking-wider text-[var(--accent-teal)]">{campaign.status}</div>
            <div className="text-xs text-[var(--surface-dark)]/40">
              Invite: <span className="font-mono text-[var(--accent-gold)]">{campaign.inviteCode}</span>
            </div>
            <div className="text-xs text-[var(--surface-dark)]/40">
              Seats: {campaign.members.length}/{campaign.maxTrailblazers}
            </div>
          </div>
        </div>

        {campaign.description && (
          <p className="text-sm text-[var(--surface-dark)]/60">{campaign.description}</p>
        )}

        {/* Pending Members — joined but no character yet */}
        {pendingMembers.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--accent-gold)] mb-3">
              Trailblazers Awaiting Characters ({pendingMembers.length})
            </div>
            <div className="space-y-2">
              {pendingMembers.map(m => (
                <div key={m.id} className="flex items-center justify-between p-3 bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/30">
                  <span className="font-bold">{m.user.username}</span>
                  <Link
                    href={`/watcher/characters/new?campaignId=${campaign.id}&userId=${m.userId}`}
                    className="text-xs text-[var(--accent-teal)] hover:underline"
                  >
                    Create Character
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Characters */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/40">
              Characters ({campaign.characters.length})
            </div>
            <Link
              href={`/watcher/characters/new?campaignId=${campaign.id}`}
              className="text-xs text-[var(--accent-teal)] hover:underline"
            >
              + New Character
            </Link>
          </div>

          {campaign.characters.length === 0 ? (
            <div className="highlight-bar">
              No characters yet. Share the invite code with Trailblazers.
            </div>
          ) : (
            <div className="space-y-2">
              {campaign.characters.map(char => (
                <div key={char.id} className="flex items-center justify-between p-3 bg-white/40 border border-[var(--surface-dark)]/10">
                  <div>
                    <Link href={`/character/${char.id}`} className="font-bold hover:underline">
                      {char.name}
                    </Link>
                    <span className="text-xs text-[var(--surface-dark)]/40 ml-2">
                      by {char.user.username}
                    </span>
                    {char.backstory && (
                      <span className={`text-[10px] uppercase tracking-wider ml-2 ${
                        char.backstory.status === 'SUBMITTED' ? 'text-[var(--krma-gold)]'
                        : char.backstory.status === 'APPROVED' ? 'text-[var(--accent-teal)]'
                        : char.backstory.status === 'REVISION' ? 'text-[var(--accent-coral)]'
                        : 'text-[var(--surface-dark)]/40'
                      }`}>
                        Backstory: {char.backstory.status}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {char.backstory?.status === 'SUBMITTED' && (
                      <Link
                        href={`/watcher/review/${char.id}`}
                        className="text-xs text-[var(--krma-gold)] hover:underline"
                      >
                        Review
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
      </div>
    </DashboardShell>
  );
}
