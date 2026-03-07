'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FateDie, GrowthCharacter } from '@/types/growth';
import { createDefaultCharacter } from '@/lib/defaults';

interface Campaign {
  id: string;
  name: string;
}

const FATE_DICE: { value: FateDie; label: string; maxTraits: number }[] = [
  { value: 'd4', label: 'd4 (4 max traits)', maxTraits: 4 },
  { value: 'd6', label: 'd6 (6 max traits)', maxTraits: 6 },
  { value: 'd8', label: 'd8 (8 max traits)', maxTraits: 8 },
  { value: 'd12', label: 'd12 (12 max traits)', maxTraits: 12 },
  { value: 'd20', label: 'd20 (20 max traits)', maxTraits: 20 },
];

export default function CharacterBuilder({ campaigns }: { campaigns: Campaign[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Form state
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id || '');
  const [name, setName] = useState('');
  const [seedName, setSeedName] = useState('');
  const [seedDesc, setSeedDesc] = useState('');
  const [fateDie, setFateDie] = useState<FateDie>('d6');
  const [rootName, setRootName] = useState('');
  const [rootDesc, setRootDesc] = useState('');
  const [branches, setBranches] = useState<{ name: string; description: string }[]>([]);

  // Attribute levels
  const [attrs, setAttrs] = useState({
    clout: 1, celerity: 1, constitution: 1,
    flow: 1, frequency: 1, focus: 1,
    willpower: 1, wisdom: 1, wit: 1,
  });

  // WTH levels
  const [wealth, setWealth] = useState(4);
  const [tech, setTech] = useState(4);
  const [health, setHealth] = useState(4);

  function addBranch() {
    setBranches([...branches, { name: '', description: '' }]);
  }

  function updateBranch(i: number, field: 'name' | 'description', value: string) {
    const updated = [...branches];
    updated[i][field] = value;
    setBranches(updated);
  }

  function removeBranch(i: number) {
    setBranches(branches.filter((_, idx) => idx !== i));
  }

  function updateAttr(key: string, value: number) {
    setAttrs(prev => ({ ...prev, [key]: Math.max(1, Math.min(20, value)) }));
  }

  async function handleSave() {
    if (!name.trim()) { setError('Character name required'); return; }
    if (!campaignId) { setError('Select a campaign'); return; }

    setSaving(true);
    setError('');

    const charData: GrowthCharacter = {
      ...createDefaultCharacter(name),
      identity: { name, background: seedDesc },
      levels: { wealthLevel: wealth, techLevel: tech, healthLevel: health },
      attributes: {
        clout: { level: attrs.clout, current: attrs.clout, augmentPositive: 0, augmentNegative: 0 },
        celerity: { level: attrs.celerity, current: attrs.celerity, augmentPositive: 0, augmentNegative: 0 },
        constitution: { level: attrs.constitution, current: attrs.constitution, augmentPositive: 0, augmentNegative: 0 },
        flow: { level: attrs.flow, current: attrs.flow, augmentPositive: 0, augmentNegative: 0 },
        frequency: { level: attrs.frequency, current: attrs.frequency },
        focus: { level: attrs.focus, current: attrs.focus, augmentPositive: 0, augmentNegative: 0 },
        willpower: { level: attrs.willpower, current: attrs.willpower, augmentPositive: 0, augmentNegative: 0 },
        wisdom: { level: attrs.wisdom, current: attrs.wisdom, augmentPositive: 0, augmentNegative: 0 },
        wit: { level: attrs.wit, current: attrs.wit, augmentPositive: 0, augmentNegative: 0 },
      },
      creation: {
        seed: { name: seedName || undefined, description: seedDesc || undefined, baseFateDie: fateDie },
        root: rootName ? { name: rootName, description: rootDesc, gmCreated: true } : undefined,
        branches: branches.filter(b => b.name).map((b, i) => ({ ...b, gmCreated: true, order: i + 1 })),
      },
    };

    try {
      // First create the character record
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, campaignId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create character');
        return;
      }

      const { character } = await res.json();

      // Then update with full data
      const updateRes = await fetch(`/api/characters/${character.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: charData, status: 'DRAFT' }),
      });

      if (!updateRes.ok) {
        setError('Character created but data save failed');
        return;
      }

      router.push(`/character/${character.id}`);
    } catch {
      setError('Connection failed');
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    // Step 0: Basics
    <div key="basics" className="space-y-4">
      <div className="section-badge inline-block">Step 1: Identity</div>
      <div className="space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 block mb-1">Campaign</label>
          <select
            value={campaignId}
            onChange={e => setCampaignId(e.target.value)}
            className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20"
          >
            {campaigns.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 block mb-1">Character Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 block mb-1">Seed (Race/Species)</label>
          <input value={seedName} onChange={e => setSeedName(e.target.value)} placeholder="e.g. Human, Cambion, Sylvani" className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 block mb-1">Seed Description</label>
          <textarea value={seedDesc} onChange={e => setSeedDesc(e.target.value)} rows={2} className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 block mb-1">Fate Die</label>
          <select value={fateDie} onChange={e => setFateDie(e.target.value as FateDie)} className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20">
            {FATE_DICE.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>,

    // Step 1: Origin
    <div key="origin" className="space-y-4">
      <div className="section-badge inline-block">Step 2: Origin (Root + Branches)</div>
      <div className="space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 block mb-1">Root (Background)</label>
          <input value={rootName} onChange={e => setRootName(e.target.value)} placeholder="e.g. Street Apothecary" className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 block mb-1">Root Description</label>
          <textarea value={rootDesc} onChange={e => setRootDesc(e.target.value)} rows={2} className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20" />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60">Branches (Life Events)</label>
            <button onClick={addBranch} className="text-xs text-[var(--accent-teal)] hover:underline">+ Add Branch</button>
          </div>
          {branches.map((b, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={b.name} onChange={e => updateBranch(i, 'name', e.target.value)} placeholder="Branch name" className="flex-1 px-3 py-1 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
              <input value={b.description} onChange={e => updateBranch(i, 'description', e.target.value)} placeholder="Description" className="flex-2 px-3 py-1 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
              <button onClick={() => removeBranch(i)} className="text-[var(--accent-coral)] text-xs px-2">x</button>
            </div>
          ))}
        </div>
      </div>
    </div>,

    // Step 2: Attributes
    <div key="attrs" className="space-y-4">
      <div className="section-badge inline-block">Step 3: Attributes</div>
      <div className="grid grid-cols-3 gap-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-center mb-3" style={{ color: '#E8585A' }}>Body (Salt)</div>
          {(['clout', 'celerity', 'constitution'] as const).map(key => (
            <div key={key} className="flex items-center justify-between mb-2">
              <span className="text-sm capitalize">{key}</span>
              <input type="number" min={1} max={20} value={attrs[key]}
                onChange={e => updateAttr(key, parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 bg-white/60 border border-[var(--surface-dark)]/20 text-center text-sm" />
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-center mb-3" style={{ color: '#3EB89A' }}>Spirit (Sulfur)</div>
          {(['flow', 'frequency', 'focus'] as const).map(key => (
            <div key={key} className="flex items-center justify-between mb-2">
              <span className="text-sm capitalize">{key}</span>
              <input type="number" min={1} max={20} value={attrs[key]}
                onChange={e => updateAttr(key, parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 bg-white/60 border border-[var(--surface-dark)]/20 text-center text-sm" />
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-center mb-3" style={{ color: '#7050A8' }}>Soul (Mercury)</div>
          {(['willpower', 'wisdom', 'wit'] as const).map(key => (
            <div key={key} className="flex items-center justify-between mb-2">
              <span className="text-sm capitalize">{key}</span>
              <input type="number" min={1} max={20} value={attrs[key]}
                onChange={e => updateAttr(key, parseInt(e.target.value) || 1)}
                className="w-16 px-2 py-1 bg-white/60 border border-[var(--surface-dark)]/20 text-center text-sm" />
            </div>
          ))}
        </div>
      </div>
    </div>,

    // Step 3: WTH Levels
    <div key="wth" className="space-y-4">
      <div className="section-badge inline-block">Step 4: WTH Levels (1-10)</div>
      <p className="text-xs text-[var(--surface-dark)]/60">
        4 = baseline (0 KRMA cost). Below 4 costs negative KRMA. Above 5 costs 10 KRMA per level.
      </p>
      <div className="space-y-3">
        {[
          { label: 'Wealth', value: wealth, set: setWealth, color: 'var(--krma-gold)' },
          { label: 'Tech', value: tech, set: setTech, color: 'var(--accent-teal)' },
          { label: 'Health', value: health, set: setHealth, color: 'var(--pillar-body)', note: '10 = immortal' },
        ].map(({ label, value, set, color, note }) => (
          <div key={label} className="flex items-center gap-4">
            <span className="text-sm w-20" style={{ color }}>{label}</span>
            <input type="range" min={1} max={10} value={value} onChange={e => set(parseInt(e.target.value))}
              className="flex-1" />
            <span className="text-sm w-8 text-center">{value}</span>
            {note && <span className="text-[10px] text-[var(--surface-dark)]/40">{note}</span>}
          </div>
        ))}
      </div>
    </div>,
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex gap-1 mb-6">
        {['Identity', 'Origin', 'Attributes', 'WTH'].map((label, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`flex-1 py-1 text-xs uppercase tracking-wider ${
              i === step ? 'bg-[var(--surface-dark)] text-[var(--accent-gold)]' : 'bg-[var(--surface-dark)]/10 text-[var(--surface-dark)]/40'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {steps[step]}

      {error && <p className="text-sm text-[var(--accent-coral)] mt-4">{error}</p>}

      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="px-4 py-2 text-sm text-[var(--surface-dark)]/60 disabled:opacity-20"
        >
          Back
        </button>

        {step < steps.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-6 py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] text-sm uppercase tracking-wider"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] text-sm uppercase tracking-wider disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Character'}
          </button>
        )}
      </div>
    </div>
  );
}
