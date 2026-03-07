import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';
import CharacterBuilder from '@/components/character/CharacterBuilder';

export default async function NewCharacterPage() {
  const session = await getSession();
  if (!session) redirect('/');

  // Get GM's campaigns for the dropdown
  const campaigns = await prisma.campaign.findMany({
    where: { gmUserId: session.user.id },
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
  });

  if (campaigns.length === 0) {
    return (
      <DashboardShell username={session.user.username} role={session.user.role}>
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="section-badge inline-block">New Character</div>
          <p className="text-sm text-[var(--surface-dark)]/60">
            You need a campaign first. Create one from the Watcher Console.
          </p>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <CharacterBuilder campaigns={campaigns} />
    </DashboardShell>
  );
}
