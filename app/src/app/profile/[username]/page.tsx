import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { isWatcherOrAbove } from '@/lib/permissions';
import DashboardShell from '@/components/DashboardShell';
import ProfileSummary from '@/components/profile/ProfileSummary';
import Link from 'next/link';

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      username: true,
      role: true,
      profile: true,
      watcherProfile: true,
      createdAt: true,
      _count: {
        select: {
          campaigns: {
            where: { listingStatus: 'LISTED', status: 'ACTIVE' },
          },
        },
      },
    },
  });

  if (!user) notFound();

  const profile = user.profile ? JSON.parse(user.profile) : null;
  // Strip topicsToAvoid
  if (profile) delete profile.topicsToAvoid;

  const watcherProfile = isWatcherOrAbove(user.role) && user.watcherProfile
    ? JSON.parse(user.watcherProfile)
    : null;

  // Get listed campaigns if they're a Watcher
  const listedCampaigns = isWatcherOrAbove(user.role)
    ? await prisma.campaign.findMany({
        where: { gmUserId: undefined, listingStatus: 'LISTED', status: 'ACTIVE' },
        select: { id: true, name: true, genre: true },
      })
    : [];

  // Actually query by the user — need a different approach since we don't have ID in this scope
  const listedCampaignsByUser = isWatcherOrAbove(user.role)
    ? await prisma.campaign.findMany({
        where: { gmUser: { username }, listingStatus: 'LISTED', status: 'ACTIVE' },
        select: { id: true, name: true, genre: true },
      })
    : [];

  const session = await getSession();

  // Wrap in shell if logged in, plain page if not
  const content = (
    <div className="max-w-2xl mx-auto space-y-6">
      <ProfileSummary
        username={user.username}
        role={user.role}
        profile={profile}
        watcherProfile={watcherProfile}
        createdAt={user.createdAt.toISOString()}
        listedCampaignsCount={user._count.campaigns}
      />

      {/* Listed campaigns */}
      {listedCampaignsByUser.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--surface-dark)]/40 font-[family-name:var(--font-terminal)]">
            Listed Campaigns
          </div>
          {listedCampaignsByUser.map(c => (
            <Link
              key={c.id}
              href={`/hub/${c.id}`}
              className="block p-2 border border-[var(--surface-dark)]/10 hover:border-[var(--accent-teal)]/40 transition-colors"
            >
              <span className="font-bold text-sm">{c.name}</span>
              {c.genre && <span className="text-xs text-[var(--surface-dark)]/40 ml-2">{c.genre}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );

  if (session) {
    return (
      <DashboardShell username={session.user.username} role={session.user.role}>
        {content}
      </DashboardShell>
    );
  }

  // Unauthenticated view
  return (
    <div className="min-h-screen bg-[var(--surface-calm)] p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Link href="/hub" className="text-xs text-[var(--accent-teal)] hover:underline font-[family-name:var(--font-terminal)]">
            &larr; Back to Hub
          </Link>
        </div>
        {content}
        <div className="mt-6 p-3 bg-[var(--accent-teal)]/5 border border-[var(--accent-teal)]/20 text-center">
          <Link href="/" className="text-sm text-[var(--accent-teal)] hover:underline">
            Create an account to apply to campaigns
          </Link>
        </div>
      </div>
    </div>
  );
}
