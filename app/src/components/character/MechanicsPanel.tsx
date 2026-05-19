'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface ForgeItemSummary {
  id: string;
  name: string;
  type: 'seed' | 'root' | 'branch' | string;
  status: string;
  data: {
    description?: string;
    baseFateDie?: string;
    fatedAge?: number;
    frequency?: number;
    baseResist?: number;
    nectars?: string[];
    thorns?: string[];
    skills?: Array<{ name: string; level: number } | string>;
  };
}

interface MechanicsPanelProps {
  characterId: string;
  campaignId: string;
  characterStatus: string; // 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ACTIVE'
}

const STATUS_COPY: Record<string, { label: string; tone: 'dim' | 'active' | 'done' }> = {
  DRAFT: { label: 'Waiting on backstory', tone: 'dim' },
  SUBMITTED: { label: 'Backstory approved — build mechanics now', tone: 'active' },
  APPROVED: { label: 'Mechanics applied — awaiting player review', tone: 'done' },
  ACTIVE: { label: 'Locked & active', tone: 'done' },
};

export default function MechanicsPanel({ characterId, campaignId, characterStatus }: MechanicsPanelProps) {
  const router = useRouter();
  const [items, setItems] = useState<ForgeItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [seedId, setSeedId] = useState<string>('');
  const [rootIds, setRootIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/forge?status=published`);
      if (!res.ok) throw new Error('Failed to load forge items');
      const data = await res.json();
      const list = (data.items || []) as ForgeItemSummary[];
      setItems(list.filter(i => i.type === 'seed' || i.type === 'root' || i.type === 'branch'));
    } catch {
      setError('Failed to load forge items');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  const seeds = items.filter(i => i.type === 'seed');
  const roots = items.filter(i => i.type === 'root');
  const branches = items.filter(i => i.type === 'branch');

  const canApply = characterStatus === 'SUBMITTED' || characterStatus === 'APPROVED';
  const statusInfo = STATUS_COPY[characterStatus] ?? { label: characterStatus, tone: 'dim' as const };

  const toggleRoot = (id: string) => setRootIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleBranch = (id: string) => setBranchIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const handleApply = async () => {
    if (!seedId) { setError('Choose a Seed first.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/characters/${characterId}/mechanics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedForgeItemId: seedId,
          rootForgeItemIds: rootIds,
          branchForgeItemIds: branchIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Apply failed');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (
    item: ForgeItemSummary,
    selected: boolean,
    onToggle: () => void,
    selectorKind: 'radio' | 'check',
  ) => (
    <button
      key={item.id}
      type="button"
      onClick={onToggle}
      className={`w-full text-left p-3 border transition-colors ${
        selected
          ? 'border-[var(--accent-teal)] bg-[var(--accent-teal)]/10'
          : 'border-white/10 hover:border-white/30 bg-black/30'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 ${selectorKind === 'radio' ? 'rounded-full' : ''} border ${selected ? 'bg-[var(--accent-teal)] border-[var(--accent-teal)]' : 'border-white/30'}`} />
        <span className="text-white text-sm font-[family-name:var(--font-header)] tracking-wider">{item.name}</span>
        {item.data.baseFateDie && (
          <span className="text-[10px] text-[var(--accent-gold)]/70 font-[family-name:var(--font-terminal)]">{item.data.baseFateDie}</span>
        )}
        {typeof item.data.fatedAge === 'number' && (
          <span className="text-[10px] text-white/30 font-[family-name:var(--font-terminal)]">~{item.data.fatedAge}yr</span>
        )}
      </div>
      {item.data.description && (
        <div className="text-white/50 text-[11px] mt-1 leading-relaxed line-clamp-2 font-[family-name:var(--font-terminal)]">
          {item.data.description}
        </div>
      )}
    </button>
  );

  if (loading) {
    return <div className="text-white/30 text-[10px] uppercase font-[family-name:var(--font-terminal)]">Loading forge items…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="text-white text-sm font-[family-name:var(--font-header)] tracking-[0.15em] uppercase">
          Mechanics
        </div>
        <div
          className="text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)]"
          style={{
            color: statusInfo.tone === 'active' ? 'var(--accent-gold)' :
                   statusInfo.tone === 'done' ? 'var(--accent-teal)' : 'rgba(255,255,255,0.3)',
          }}
        >
          {statusInfo.label}
        </div>
      </div>

      {!canApply && (
        <div className="text-white/40 text-xs font-[family-name:var(--font-terminal)]">
          {characterStatus === 'DRAFT'
            ? 'Approve the backstory above first. Then the Seed/Root/Branch pickers will activate.'
            : 'Mechanics already applied. Player is reviewing — they can lock in or request changes.'}
        </div>
      )}

      {/* Seed picker — required */}
      <div className={canApply ? '' : 'opacity-40 pointer-events-none'}>
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2 font-[family-name:var(--font-terminal)]">
          Seed <span className="text-[#E8585A]">*</span>
        </div>
        {seeds.length === 0 ? (
          <div className="text-white/30 text-xs">No published seeds in this campaign forge. Author one first.</div>
        ) : (
          <div className="space-y-2">
            {seeds.map(s => renderRow(s, seedId === s.id, () => setSeedId(s.id), 'radio'))}
          </div>
        )}
      </div>

      {/* Root picker — optional (up to 5) */}
      <div className={canApply ? '' : 'opacity-40 pointer-events-none'}>
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2 font-[family-name:var(--font-terminal)]">
          Roots (origin / background)
        </div>
        {roots.length === 0 ? (
          <div className="text-white/30 text-xs">No published roots in this campaign forge.</div>
        ) : (
          <div className="space-y-2">
            {roots.map(r => renderRow(r, rootIds.includes(r.id), () => toggleRoot(r.id), 'check'))}
          </div>
        )}
      </div>

      {/* Branch picker — optional (up to 5) */}
      <div className={canApply ? '' : 'opacity-40 pointer-events-none'}>
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-2 font-[family-name:var(--font-terminal)]">
          Branches (life events)
        </div>
        {branches.length === 0 ? (
          <div className="text-white/30 text-xs">No published branches in this campaign forge.</div>
        ) : (
          <div className="space-y-2">
            {branches.map(b => renderRow(b, branchIds.includes(b.id), () => toggleBranch(b.id), 'check'))}
          </div>
        )}
      </div>

      {error && <div className="text-[#E8585A] text-xs font-[family-name:var(--font-terminal)]">{error}</div>}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply || !seedId || saving}
          className="px-5 py-2 text-[11px] uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)] text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {saving ? 'Applying…' : characterStatus === 'APPROVED' ? 'Re-apply mechanics' : 'Apply mechanics → player review'}
        </button>
      </div>
    </div>
  );
}
