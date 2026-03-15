import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';
import HubApplyForm from '@/components/hub/HubApplyForm';

const DEFAULT_CAMPAIGN_PROMPTS = [
  { id: 'campaign-1', prompt: 'What excites you about this campaign specifically?', required: true, category: 'interest' },
  { id: 'campaign-2', prompt: 'What kind of character concept are you considering?', required: false, category: 'character' },
  { id: 'campaign-3', prompt: 'Is there anything else you\'d like the Watcher to know?', required: false, category: 'other' },
];

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      listingStatus: true,
      status: true,
      maxTrailblazers: true,
      applicationTemplate: true,
      requiredFields: true,
      gmUserId: true,
      _count: { select: { members: true } },
    },
  });

  if (!campaign) notFound();

  // Validate can apply
  if (campaign.listingStatus !== 'LISTED' || campaign.status !== 'ACTIVE') redirect(`/hub/${id}`);
  if (campaign._count.members >= campaign.maxTrailblazers) redirect(`/hub/${id}`);
  if (campaign.gmUserId === session.user.id) redirect(`/hub/${id}`);

  // Check not already member
  const existing = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: id, userId: session.user.id } },
  });
  if (existing) redirect(`/hub/${id}`);

  const prompts = campaign.applicationTemplate
    ? JSON.parse(campaign.applicationTemplate)
    : DEFAULT_CAMPAIGN_PROMPTS;

  const requiredFields: string[] = campaign.requiredFields
    ? JSON.parse(campaign.requiredFields)
    : [];

  // Get user profile (strip topicsToAvoid for display)
  const profile = session.user.profile ? JSON.parse(session.user.profile) : null;
  if (profile) delete profile.topicsToAvoid;

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="font-[family-name:var(--font-header)] text-3xl tracking-wider text-[var(--surface-dark)]">
            Apply to {campaign.name}
          </h1>
        </div>

        <HubApplyForm
          campaignId={campaign.id}
          campaignName={campaign.name}
          prompts={prompts}
          requiredFields={requiredFields}
          userProfile={{
            username: session.user.username,
            role: session.user.role,
            profile,
          }}
        />
      </div>
    </DashboardShell>
  );
}
