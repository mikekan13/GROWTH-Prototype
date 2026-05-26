import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { canViewCharacter } from '@/lib/permissions';
import DashboardShell from '@/components/DashboardShell';
import CharacterPageClient from './CharacterPageClient';
import CreationReviewBanner from '@/components/character/CreationReviewBanner';

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      campaign: { select: { id: true, name: true, gmUserId: true } },
      godHead: { select: { id: true, aiActionMode: true } },
    },
  });

  if (!character) {
    redirect('/trailblazer');
  }

  if (!canViewCharacter(session.user.id, session.user.role, character)) {
    redirect('/trailblazer');
  }

  const isGM =
    session.user.role === 'ADMIN' ||
    (character.campaign?.gmUserId === session.user.id);
  const isOwner = character.userId === session.user.id;
  const canEdit = isGM || isOwner;
  const aiActionMode = character.godHead?.aiActionMode ?? false;

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="mb-4 text-xs text-[var(--surface-dark)]/40 uppercase tracking-wider">
        {character.campaign?.name ?? 'No Campaign'} | {character.status}
      </div>
      <CreationReviewBanner
        characterId={character.id}
        status={character.status}
        isOwner={isOwner}
      />
      <CharacterPageClient
        campaignId={character.campaign?.id ?? ''}
        isGM={isGM}
        userId={session.user.id}
        userRole={session.user.role}
        characterData={{
          id: character.id,
          name: character.name,
          data: character.data,
          entityType: character.entityType,
          status: character.status,
        }}
        canEdit={canEdit}
        aiActionMode={aiActionMode}
      />
    </DashboardShell>
  );
}
