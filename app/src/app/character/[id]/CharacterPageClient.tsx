'use client';

import CharacterTab from '@/components/character/CharacterTab';

interface CharacterPageClientProps {
  campaignId: string;
  isGM: boolean;
  userId: string;
  userRole: string;
  characterData: { id: string; name: string; data: string; entityType?: string };
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
