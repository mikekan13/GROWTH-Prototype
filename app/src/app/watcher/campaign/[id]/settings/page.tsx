import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canManageCampaign } from '@/lib/permissions';
import DashboardShell from '@/components/DashboardShell';
import Link from 'next/link';
import CampaignSettingsForm from '@/components/campaign/CampaignSettingsForm';

export default async function CampaignSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      _count: { select: { members: true } },
    },
  });

  if (!campaign) redirect('/watcher');
  if (!canManageCampaign(session.user.id, session.user.role, campaign)) redirect('/watcher');

  const customPrompts: string[] = campaign.customPrompts
    ? JSON.parse(campaign.customPrompts)
    : [];

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link
            href={`/watcher/campaign/${campaign.id}`}
            className="text-xs text-[var(--surface-dark)]/40 hover:text-[var(--surface-dark)]/60 uppercase tracking-wider"
          >
            &larr; Back to Campaign
          </Link>
          <h1 className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--surface-dark)] mt-1">
            Campaign Settings
          </h1>
        </div>

        <CampaignSettingsForm
          campaignId={campaign.id}
          initialData={{
            name: campaign.name,
            description: campaign.description ?? '',
            worldContext: campaign.worldContext ?? '',
            status: campaign.status,
            maxTrailblazers: campaign.maxTrailblazers,
            inviteCode: campaign.inviteCode ?? '',
            customPrompts,
            currentMemberCount: campaign._count.members,
          }}
        />
      </div>
    </DashboardShell>
  );
}
