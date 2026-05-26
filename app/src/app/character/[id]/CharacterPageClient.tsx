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
  hasAIPersona: boolean;
}

export default function CharacterPageClient({
  campaignId,
  isGM,
  userId,
  userRole,
  characterData,
  canEdit,
  hasAIPersona,
}: CharacterPageClientProps) {
  const router = useRouter();
  const [deathModalOpen, setDeathModalOpen] = useState(false);
  const [enablingAI, setEnablingAI] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);

  const handleEnableAI = async () => {
    setEnablingAI(true);
    setEnableError(null);
    try {
      const res = await fetch(`/api/characters/${characterData.id}/enable-ai`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to enable AI' }));
        setEnableError(err.error || 'Failed to enable AI');
        return;
      }
      router.refresh();
    } catch (e) {
      setEnableError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setEnablingAI(false);
    }
  };
  // Player viewing their own character (not GM): render the read-only sheet.
  // CharacterTab is the GM-editing surface and includes seed/identity pickers
  // that the player should never see — those decisions live with the GM.
  const renderAsSheet = !isGM;
  // Death split is GM-only and only meaningful for live characters.
  const showMarkDead = isGM && canEdit
    && characterData.status !== 'DEAD'
    && characterData.status !== 'DRAFT'
    && characterData.entityType !== 'GODHEAD';
  // AI persona editor: visible whenever the character has an attached
  // GodHead row AND the viewer can edit the character (admin, campaign GM,
  // or character owner). Display gate matches the write gate because the
  // panel is editable.
  const showAIPersona = hasAIPersona && canEdit;
  // "Enable AI" button: GM/owner only, only when no persona exists yet.
  const showEnableAI = canEdit && !hasAIPersona;

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
        {showEnableAI && (
          <EnableAIBlock
            enabling={enablingAI}
            error={enableError}
            onEnable={handleEnableAI}
          />
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
      {showEnableAI && (
        <EnableAIBlock
          enabling={enablingAI}
          error={enableError}
          onEnable={handleEnableAI}
        />
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

interface EnableAIBlockProps {
  enabling: boolean;
  error: string | null;
  onEnable: () => void;
}

function EnableAIBlock({ enabling, error, onEnable }: EnableAIBlockProps) {
  return (
    <div
      className="max-w-4xl mx-auto mt-6 border p-5"
      style={{
        borderColor: '#22ab9433',
        background: '#0a0a14',
        boxShadow: '0 0 32px rgba(34,171,148,0.06)',
      }}
    >
      <div className="text-[11px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase text-[#22ab94] mb-2">
        ◈ AI Persona
      </div>
      <div className="text-[12px] font-[family-name:var(--font-terminal)] text-white/60 mb-4 leading-relaxed">
        This character has no AI agent attached. Enabling AI mints a placeholder
        persona + KRMA wallet so an agent can drive this character. You can edit
        the system prompt, model, and pillar afterward from the same panel.
      </div>
      {error && (
        <div
          className="border p-2 mb-3 text-[11px] font-[family-name:var(--font-terminal)]"
          style={{ borderColor: '#E8585A55', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
        >
          ✗ {error}
        </div>
      )}
      <button
        onClick={onEnable}
        disabled={enabling}
        className="px-5 py-2 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] font-bold disabled:opacity-30 transition-all"
        style={{
          background: enabling ? 'rgba(34,171,148,0.3)' : 'linear-gradient(135deg, #22ab94, #1a8d7a)',
          color: '#000',
          boxShadow: enabling ? 'none' : '0 0 20px rgba(34,171,148,0.3)',
        }}
      >
        {enabling ? 'Enabling…' : 'Enable AI ›'}
      </button>
    </div>
  );
}
