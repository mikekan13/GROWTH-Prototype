'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CharacterTab from '@/components/character/CharacterTab';
import CharacterSheet from '@/components/character/CharacterSheet';
import DeathSplitModal from '@/components/character/DeathSplitModal';
import GodheadPersonaPanel from '@/components/character/GodheadPersonaPanel';
import type { GrowthCharacter } from '@/types/growth';

interface CharacterPageClientProps {
  campaignId: string;
  isGM: boolean;
  userId: string;
  userRole: string;
  characterData: { id: string; name: string; data: string; entityType?: string; status?: string };
  canEdit: boolean;
  aiActionMode: boolean;
}

export default function CharacterPageClient({
  campaignId,
  isGM,
  userId,
  userRole,
  characterData,
  canEdit,
  aiActionMode,
}: CharacterPageClientProps) {
  const router = useRouter();
  const [deathModalOpen, setDeathModalOpen] = useState(false);
  // Player viewing their own character (not GM): render the read-only sheet.
  // CharacterTab is the GM-editing surface and includes seed/identity pickers
  // that the player should never see — those decisions live with the GM.
  const renderAsSheet = !isGM;
  // Death split is GM-only and only meaningful for live characters.
  const showMarkDead = isGM && canEdit
    && characterData.status !== 'DEAD'
    && characterData.status !== 'DRAFT'
    && characterData.entityType !== 'GODHEAD';
  // AI persona editor: visible whenever AI is currently choosing actions for
  // this character AND the viewer can edit. Toggle for enabling AI lives on
  // the canvas character card, not here — so no Enable button on this page.
  const showAIPersona = aiActionMode && canEdit;

  const parsed = useMemo<GrowthCharacter | null>(() => {
    if (!renderAsSheet) return null;
    try { return JSON.parse(characterData.data) as GrowthCharacter; } catch { return null; }
  }, [renderAsSheet, characterData.data]);

  if (renderAsSheet) {
    if (!parsed) {
      return (
        <div className="text-sm text-[var(--surface-dark)]/50 p-6">
          Unable to parse character data.
        </div>
      );
    }
    return (
      <>
        <CharacterSheet
          character={parsed}
          characterId={canEdit ? characterData.id : undefined}
          onRefresh={() => router.refresh()}
        />
        {showAIPersona && (
          <GodheadPersonaPanel godheadName={characterData.name} />
        )}
      </>
    );
  }

  return (
    <>
      {showMarkDead && (
        <div className="flex justify-end gap-2 px-4 pt-3">
          <button
            onClick={() => setDeathModalOpen(true)}
            className="px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] border transition-colors hover:bg-[#E8585A]/10"
            style={{
              borderColor: 'rgba(232,88,90,0.4)',
              color: '#E8585A',
              background: 'rgba(232,88,90,0.06)',
            }}
            title="Lady Death settles — split KRMA via the immutable ledger"
          >
            ☠ Mark Dead
          </button>
        </div>
      )}
      <CharacterTab
        campaignId={campaignId}
        userId={userId}
        userRole={userRole}
        isGM={isGM}
        userCharacter={characterData}
        canEdit={canEdit}
      />
      {showAIPersona && (
        <GodheadPersonaPanel godheadName={characterData.name} />
      )}
      {deathModalOpen && (
        <DeathSplitModal
          characterId={characterData.id}
          characterName={characterData.name}
          onClose={() => setDeathModalOpen(false)}
          onApplied={() => {
            setDeathModalOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
