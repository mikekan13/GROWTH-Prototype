import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canViewCharacter } from '@/lib/permissions';
import DashboardShell from '@/components/DashboardShell';
import CharacterSheet from '@/components/character/CharacterSheet';
import type { GrowthCharacter } from '@/types/growth';

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: { campaign: { select: { name: true, gmUserId: true } } },
  });

  if (!character) {
    redirect('/trailblazer');
  }

  if (!canViewCharacter(session.user.id, session.user.role, character)) {
    redirect('/trailblazer');
  }

  const data = JSON.parse(character.data) as GrowthCharacter;

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="mb-4 text-xs text-[var(--surface-dark)]/40 uppercase tracking-wider">
        {character.campaign.name} | {character.status}
      </div>
      <CharacterSheet character={data} />
    </DashboardShell>
  );
}
