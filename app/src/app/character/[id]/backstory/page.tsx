import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import DashboardShell from '@/components/DashboardShell';
import BackstoryEditor from '@/components/BackstoryEditor';

export default async function BackstoryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      backstory: true,
      campaign: { select: { name: true, customPrompts: true } },
    },
  });

  if (!character) redirect('/trailblazer');

  // Only the character owner can write backstory
  if (character.userId !== session.user.id) {
    redirect('/trailblazer');
  }

  // Parse structured data
  const existingResponses = character.backstory?.responses
    ? JSON.parse(character.backstory.responses)
    : undefined;

  const customPrompts = character.campaign.customPrompts
    ? JSON.parse(character.campaign.customPrompts)
    : undefined;

  return (
    <DashboardShell username={session.user.username} role={session.user.role}>
      <div className="max-w-2xl mx-auto">
        <div className="text-xs text-[var(--surface-dark)]/40 uppercase tracking-wider mb-4">
          {character.campaign.name}
        </div>
        <BackstoryEditor
          characterId={character.id}
          characterName={character.name}
          existingResponses={existingResponses}
          existingStatus={character.backstory?.status}
          gmNotes={character.backstory?.gmNotes}
          customPrompts={customPrompts}
        />
      </div>
    </DashboardShell>
  );
}
