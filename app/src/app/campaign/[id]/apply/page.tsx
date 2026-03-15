import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';
import PlayerApplicationForm from '@/components/application/PlayerApplicationForm';

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  // Verify membership
  const member = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: id, userId: session.user.id } },
    include: {
      campaign: { select: { id: true, name: true } },
    },
  });

  if (!member) redirect('/trailblazer');

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <PlayerApplicationForm
        campaignId={member.campaign.id}
        campaignName={member.campaign.name}
      />
    </DashboardShell>
  );
}
