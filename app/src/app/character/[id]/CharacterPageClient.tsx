'use client';

import { useMemo } from 'react';
import CharacterTab from '@/components/character/CharacterTab';
import CharacterSheet from '@/components/character/CharacterSheet';
import type { GrowthCharacter } from '@/types/growth';

interface CharacterPageClientProps {
  campaignId: string;
  isGM: boolean;
  userId: string;
  userRole: string;
  characterData: { id: string; name: string; data: string; entityType?: string; status?: string };
  canEdit: boolean;
}

export default function CharacterPageClient({
  campaignId,
  isGM,
  userId,
  userRole,
  characterData,
  canEdit,
}: CharacterPageClientProps) {
  // Player viewing their own character (not GM): render the read-only sheet.
  // CharacterTab is the GM-editing surface and includes seed/identity pickers
  // that the player should never see — those decisions live with the GM.
  const renderAsSheet = !isGM;

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
    return <CharacterSheet character={parsed} />;
  }

  return (
    <CharacterTab
      campaignId={campaignId}
      userId={userId}
      userRole={userRole}
      isGM={isGM}
      userCharacter={characterData}
      canEdit={canEdit}
    />
  );
}
