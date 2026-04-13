import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';
import DashboardShell from '@/components/DashboardShell';
import ProfileSummary from '@/components/profile/ProfileSummary';
import Link from 'next/link';
import InterestButton from '@/components/hub/InterestButton';

export default async function CampaignListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      genre: true,
      description: true,
      listingStatus: true,
      listingDescription: true,
      listingTags: true,
      requiredFields: true,
      maxTrailblazers: true,
      status: true,
      createdAt: true,
      gmUser: {
        select: {
          username: true,
          role: true,
          profile: true,
          watcherProfile: true,
        },
      },
      _count: { select: { members: true } },
    },
  });

  if (!campaign) notFound();

  const tags: string[] = campaign.listingTags ? JSON.parse(campaign.listingTags) : [];
  const requiredFields: string[] = campaign.requiredFields ? JSON.parse(campaign.requiredFields) : [];
  const isFull = campaign._count.members >= campaign.maxTrailblazers;
  const description = campaign.listingDescription || campaign.description;

  // GM profile (strip topicsToAvoid)
  const gmProfile = campaign.gmUser.profile ? JSON.parse(campaign.gmUser.profile) : null;
  if (gmProfile) delete gmProfile.topicsToAvoid;
  const gmWatcherProfile = isWatcherOrAbove(campaign.gmUser.role) && campaign.gmUser.watcherProfile
    ? JSON.parse(campaign.gmUser.watcherProfile) : null;

  const session = await getSession();

  let isMember = false;

  // Check if user has already expressed interest
  let memberStatus: string | null = null;
  if (session) {
    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: id, userId: session.user.id } },
      select: { status: true },
    });
    memberStatus = member?.status || null;
    isMember = !!member;
  }

  const canExpress = session
    && campaign.listingStatus === 'LISTED'
    && campaign.status === 'ACTIVE'
    && !isFull
    && !isMember
    && campaign.gmUser.username !== session.user.username;

  const content = (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link href="/hub" className="text-xs text-[var(--accent-teal)] hover:underline font-[family-name:var(--font-terminal)]">
        &larr; Back to Hub
      </Link>

      {/* Campaign header */}
      <div>
        <h1 className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--surface-dark)]">
          {campaign.name}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          {campaign.genre && (
            <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--pillar-soul)] font-[family-name:var(--font-terminal)]">
              {campaign.genre}
            </span>
          )}
          <span className={`text-[10px] uppercase tracking-wider font-[family-name:var(--font-terminal)] ${isFull ? 'text-[var(--pillar-body)]' : 'text-[var(--accent-teal)]'}`}>
            {campaign._count.members}/{campaign.maxTrailblazers} players
          </span>
        </div>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-[var(--surface-dark)]/5 border border-[var(--surface-dark)]/10 text-xs text-[var(--surface-dark)]/60">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {description && (
        <div className="text-sm text-[var(--surface-dark)]/80 whitespace-pre-wrap leading-relaxed">
          {description}
        </div>
      )}

      {/* Required fields */}
      {requiredFields.length > 0 && (
        <div className="p-3 border border-[var(--surface-dark)]/10 bg-white/30">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--surface-dark)]/40 font-[family-name:var(--font-terminal)] mb-1">
            Required Profile Fields
          </div>
          <div className="flex flex-wrap gap-1">
            {requiredFields.map(f => (
              <span key={f} className="px-1.5 py-0.5 bg-[var(--accent-gold)]/10 border border-[var(--accent-gold)]/20 text-xs text-[var(--accent-gold)]">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Interest / Status */}
      <div className="space-y-2">
        {canExpress && (
          <InterestButton campaignId={campaign.id} />
        )}
        {memberStatus === 'INTERESTED' && (
          <div className="text-xs text-[var(--accent-gold)] font-[family-name:var(--font-terminal)]">
            You have expressed interest. Waiting for the GM to review.
          </div>
        )}
        {memberStatus && !['INTERESTED', 'REJECTED'].includes(memberStatus) && (
          <Link
            href={`/campaign/${campaign.id}`}
            className="inline-block px-8 py-2 bg-[var(--accent-teal)] text-white text-sm font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:bg-[var(--accent-teal)]/80 transition-colors"
          >
            Enter Campaign
          </Link>
        )}
        {memberStatus === 'REJECTED' && (
          <div className="text-xs text-[var(--pillar-body)] font-[family-name:var(--font-terminal)]">
            Your interest was not accepted for this campaign.
          </div>
        )}
        {isFull && !isMember && (
          <div className="text-xs text-[var(--pillar-body)] font-[family-name:var(--font-terminal)]">
            This campaign is full
          </div>
        )}
        {!session && (
          <div className="p-3 bg-[var(--accent-teal)]/5 border border-[var(--accent-teal)]/20">
            <Link href="/" className="text-sm text-[var(--accent-teal)] hover:underline">
              Log in to join
            </Link>
          </div>
        )}
      </div>

      {/* GM Profile */}
      <div className="border-t border-[var(--surface-dark)]/10 pt-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--surface-dark)]/40 font-[family-name:var(--font-terminal)] mb-3">
          Game Master
        </div>
        <Link href={`/profile/${campaign.gmUser.username}`} className="block hover:opacity-80 transition-opacity">
          <ProfileSummary
            username={campaign.gmUser.username}
            role={campaign.gmUser.role}
            profile={gmProfile}
            watcherProfile={gmWatcherProfile}
          />
        </Link>
      </div>
    </div>
  );

  if (session) {
    return (
      <DashboardShell username={session.user.username} role={session.user.role}>
        {content}
      </DashboardShell>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-calm)] p-8">
      {content}
    </div>
  );
}
