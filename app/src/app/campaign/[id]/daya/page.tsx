import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canManageCampaign } from '@/lib/permissions';
import DayaTestCanvas from '@/components/daya/DayaTestCanvas';

// The WP12 "test canvas" — lets a GM/ADMIN take an existing Character in
// this campaign, wrap it as a persona-harness entity, author her soul-level
// params, seed vines/memories, wake her, and converse 1:1. No new sheet
// mechanics — every control here calls the existing engine (services/goal,
// services/character) through src/daya/authoring.ts's thin service layer.
export default async function DayaTestCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      gmUserId: true,
      characters: {
        select: { id: true, name: true, entityType: true, status: true },
        orderBy: { name: 'asc' },
      },
    },
  });
  if (!campaign) redirect('/terminal');

  if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
    redirect('/terminal');
  }

  return (
    <DayaTestCanvas
      campaignId={campaign.id}
      campaignName={campaign.name}
      characters={campaign.characters}
      userRole={session.user.role}
    />
  );
}
