import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canEditCharacter } from '@/lib/permissions';
import DashboardShell from '@/components/DashboardShell';
import BackstoryReview from '@/components/BackstoryReview';
import Link from 'next/link';

export default async function ReviewBackstoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      user: { select: { username: true } },
      backstory: true,
      campaign: { select: { id: true, name: true, gmUserId: true } },
    },
  });

  if (!character) redirect('/watcher');
  if (!canEditCharacter(session.user.id, session.user.role, character)) redirect('/watcher');

  if (!character.backstory) {
    return (
      <DashboardShell username={session.user.username} role={session.user.role}>
        <div className="max-w-2xl mx-auto space-y-4">
          <Link href={`/watcher/campaign/${character.campaign.id}`} className="text-xs text-[var(--surface-dark)]/40 hover:text-[var(--surface-dark)]/60 uppercase tracking-wider">
            &larr; {character.campaign.name}
          </Link>
          <div className="highlight-bar">No backstory submitted yet for {character.name}.</div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-2xl mx-auto">
        <Link
          href={`/watcher/campaign/${character.campaign.id}`}
          className="text-xs text-[var(--surface-dark)]/40 hover:text-[var(--surface-dark)]/60 uppercase tracking-wider"
        >
          &larr; {character.campaign.name}
        </Link>
        <div className="mt-4">
          <BackstoryReview
            characterId={character.id}
            characterName={character.name}
            playerName={character.user.username}
            responses={JSON.parse(character.backstory.responses)}
            status={character.backstory.status}
            existingNotes={character.backstory.gmNotes}
          />
        </div>
      </div>
    </DashboardShell>
  );
}
