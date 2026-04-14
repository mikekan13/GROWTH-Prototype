'use client';

import { useState, useEffect, useCallback } from 'react';
import CharacterTab from '@/components/character/CharacterTab';

interface Entity {
  id: string;
  name: string;
  entityType: string;
  status: string;
  portrait: string | null;
  seedName: string | null;
  tkv: number | null;
  stewarding: boolean;
  stewardName: string | null;
  activeGoals: number;
  createdAt: string;
}

interface EntitiesPanelProps {
  campaignId: string;
  isGM: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--accent-teal)',
  DRAFT: 'rgba(255,255,255,0.25)',
  APPROVED: 'var(--accent-teal)',
  SUBMITTED: 'var(--accent-gold)',
  DEAD: '#E8585A',
  RETIRED: '#888',
};

function formatKrma(n: number): string {
  return n.toLocaleString();
}

export default function EntitiesPanel({ campaignId, isGM }: EntitiesPanelProps) {
  const [wizardEntityId, setWizardEntityId] = useState<string | null>(null);
  const [wizardCharacter, setWizardCharacter] = useState<{ id: string; name: string; data: string; entityType?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // When an entity wizard opens, fetch the full character record so CharacterTab
  // has the data string it expects. Same API players hit for their own character.
  useEffect(() => {
    if (!wizardEntityId) { setWizardCharacter(null); return; }
    (async () => {
      try {
        const res = await fetch(`/api/characters/${wizardEntityId}`);
        if (!res.ok) return;
        const { character } = await res.json();
        setWizardCharacter({
          id: character.id,
          name: character.name,
          data: typeof character.data === 'string' ? character.data : JSON.stringify(character.data),
          entityType: character.entityType,  // signals "GM owns this; editable" to CharacterTab
        });
      } catch { /* ignore — wizard will load empty */ }
    })();
  }, [wizardEntityId]);

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEntities(data.entities || []);
    } catch {
      setError('Failed to load entities');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { fetchEntities(); }, [fetchEntities]);

  const handleCreateEntity = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create');
      const data = await res.json();
      await fetchEntities();
      setWizardEntityId(data.id);
    } catch {
      setError('Failed to create entity');
    } finally {
      setCreating(false);
    }
  };

  const handleEntityClick = (entity: Entity) => {
    // GM can open the wizard for any entity they own (not just DRAFT) — same component
    // the player uses for their own character, now the GM's editor for NPCs.
    if (isGM) {
      setWizardEntityId(entity.id);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
        Loading entities...
      </div>
    );
  }

  if (error && entities.length === 0) {
    return (
      <div className="text-center py-12 text-[#E8585A]/60 text-[10px] font-[family-name:var(--font-terminal)]">
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Header row with create button */}
      {isGM && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-[9px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase text-white/30">
            {entities.length} entit{entities.length === 1 ? 'y' : 'ies'}
          </div>
          <button
            className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)] text-black hover:brightness-110 transition-colors disabled:opacity-50"
            onClick={handleCreateEntity}
            disabled={creating}
          >
            {creating ? 'Creating...' : '+ Create Entity'}
          </button>
        </div>
      )}

      {entities.length === 0 ? (
        <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
          {isGM
            ? 'No entities yet. Create your first entity to begin.'
            : 'No entities in this campaign yet.'}
        </div>
      ) : (
        <div className="space-y-1">
          {/* Column headers */}
          <div className="flex items-center gap-3 px-3 py-1 text-[8px] font-[family-name:var(--font-terminal)] tracking-[0.15em] uppercase text-white/20 border-b border-white/5">
            <span className="w-[180px]">Name</span>
            <span className="w-[100px]">Seed</span>
            <span className="w-[70px] text-right">Ҝ Value</span>
            <span className="w-[80px]">Steward</span>
            <span className="w-[50px] text-center">Goals</span>
            <span className="w-[70px]">Status</span>
          </div>

          {/* Entity rows */}
          {entities.map(entity => {
            const statusColor = STATUS_COLOR[entity.status] || 'rgba(255,255,255,0.25)';
            const isDraft = entity.status === 'DRAFT';
            return (
              <div
                key={entity.id}
                className={`flex items-center gap-3 px-3 py-2 border border-white/5 transition-colors ${
                  isGM ? 'hover:bg-white/5 cursor-pointer' : ''
                }`}
                style={{
                  background: isDraft ? 'rgba(62,184,154,0.03)' : 'rgba(0,0,0,0.2)',
                  borderColor: isDraft ? 'rgba(62,184,154,0.1)' : undefined,
                }}
                onClick={() => handleEntityClick(entity)}
              >
                {/* Name + portrait placeholder */}
                <div className="w-[180px] flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[8px] font-bold"
                    style={{
                      background: entity.portrait ? `url(${entity.portrait}) center/cover` : 'rgba(255,255,255,0.05)',
                      color: 'rgba(255,255,255,0.3)',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {!entity.portrait && entity.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white text-[11px] font-bold font-[family-name:var(--font-header)] tracking-wider truncate">
                    {entity.name}
                  </span>
                  {isDraft && isGM && (
                    <span className="text-[9px] font-[family-name:var(--font-terminal)] text-[#3EB89A]/50 ml-1">
                      ▸ resume
                    </span>
                  )}
                </div>

                {/* Seed */}
                <span className="w-[100px] text-[10px] text-white/40 font-[family-name:var(--font-terminal)] truncate">
                  {entity.seedName || '—'}
                </span>

                {/* TKV */}
                <span className="w-[70px] text-right text-[10px] font-[family-name:var(--font-header)] tracking-wider"
                  style={{ color: '#D4A830' }}
                >
                  {entity.tkv != null ? formatKrma(entity.tkv) : '—'}
                </span>

                {/* Steward */}
                <span className="w-[80px] text-[10px] font-[family-name:var(--font-terminal)] truncate"
                  style={{ color: entity.stewarding ? 'var(--accent-teal)' : 'rgba(255,255,255,0.15)' }}
                >
                  {entity.stewardName || '—'}
                </span>

                {/* Active goals */}
                <span className="w-[50px] text-center text-[10px] font-[family-name:var(--font-terminal)]"
                  style={{ color: entity.activeGoals > 0 ? '#4ade80' : 'rgba(255,255,255,0.15)' }}
                >
                  {entity.activeGoals > 0 ? entity.activeGoals : '—'}
                </span>

                {/* Status */}
                <span
                  className="w-[70px] text-[8px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] px-1.5 py-0.5 text-center"
                  style={{ background: `${statusColor}20`, color: statusColor }}
                >
                  {entity.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Same CharacterTab players use — pointed at this GM-owned entity.
          One component, one source of truth. Player edits their PC; GM edits any entity. */}
      {wizardEntityId && wizardCharacter && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.92)' }}
        >
          <div className="w-full max-w-5xl py-6 px-4">
            <div className="flex justify-between items-center mb-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-[family-name:var(--font-terminal)]">
                Editing Entity — {wizardCharacter.name}
              </div>
              <button
                onClick={() => { setWizardEntityId(null); fetchEntities(); }}
                className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] text-white/60 hover:text-[#E8585A] transition-colors"
              >
                Close
              </button>
            </div>
            <CharacterTab
              campaignId={campaignId}
              isGM={isGM}
              userCharacter={wizardCharacter}
              canEdit={true}
            />
          </div>
        </div>
      )}
    </div>
  );
}
