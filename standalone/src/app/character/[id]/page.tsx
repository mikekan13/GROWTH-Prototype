import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import CharacterTab from '@/components/character/CharacterTab';

/**
 * Standalone character editor page — single character focus, full-screen wizard.
 * The same CharacterTab component the main app uses (port-back syncs stay in sync).
 */
export default async function StandaloneCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/');

  const { id } = await params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: { campaign: { select: { id: true, gmUserId: true, name: true, aiSettings: true } } },
  });

  if (!character) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="text-center">
          <div className="text-xl mb-2" style={{ fontFamily: 'var(--font-bebas-neue)' }}>Character not found</div>
          <a href="/" className="text-xs text-[#D0A030] underline">← Back to picker</a>
        </div>
      </main>
    );
  }

  const isOwner = character.userId === session.user.id;
  const isGM = character.campaign?.gmUserId === session.user.id;
  const canEdit = isOwner || isGM || session.user.role === 'ADMIN';

  if (!canEdit) redirect('/');

  return (
    <main className="min-h-screen bg-black">
      {/* Back nav */}
      <div className="absolute top-4 left-4 z-50">
        <a href="/" className="text-xs text-white/50 hover:text-[#D0A030] transition-colors" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          ← All characters
        </a>
      </div>

      {/* Absolute-positioned wizard (CharacterTab expects absolute inset-0 container) */}
      <div className="relative h-screen">
        <CharacterTab
          campaignId={character.campaign?.id || ''}
          isGM={isGM}
          userCharacter={{
            id: character.id,
            name: character.name,
            data: typeof character.data === 'string' ? character.data : JSON.stringify(character.data),
            entityType: character.entityType,
          }}
          canEdit={canEdit}
        />
      </div>
    </main>
  );
}
