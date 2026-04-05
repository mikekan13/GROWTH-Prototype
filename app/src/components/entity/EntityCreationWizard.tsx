'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { SEED_CATALOG, FATE_DIE_VALUE, getSeed } from '@/lib/seed-catalog';
import type { GrowthSeed, FateDie } from '@/types/growth';

// --- Wizard state shape ---
// ForgeBlock = a selected forge item (root, branch, skill, trait, etc.)
export interface ForgeBlock {
  id: string;
  name: string;
  type: string;
  data: Record<string, unknown>;
}

export interface EntityDraft {
  // Step 1: Intake
  name: string;
  prompt: string;
  targetKV: number;
  // Step 2: Seed
  seed: GrowthSeed | null;
  // Step 3: Root (selected from campaign forge)
  root: ForgeBlock | null;
}

const STEPS = [
  { key: 'intake', label: 'Describe' },
  { key: 'seed', label: 'Seed' },
  { key: 'roots', label: 'Root & Branches' },
  { key: 'attributes', label: 'Attributes' },
  { key: 'wth', label: 'WTH Levels' },
  { key: 'skills', label: 'Skills' },
  { key: 'traits', label: 'Traits' },
  { key: 'goals', label: 'Goals' },
  { key: 'review', label: 'Review' },
] as const;

// KV presets for quick selection
const KV_PRESETS = [
  { label: 'Commoner', value: 200, description: 'Simple folk, minimal abilities' },
  { label: 'Trained', value: 500, description: 'Skilled professional, competent' },
  { label: 'Veteran', value: 1000, description: 'Experienced, battle-tested' },
  { label: 'Elite', value: 2000, description: 'Exceptional, rare talent' },
  { label: 'Legendary', value: 3500, description: 'World-shaping power' },
] as const;

interface Props {
  campaignId: string;
  entityId: string;
  onCancel: () => void;
  onComplete: () => void;
}

function createEmptyDraft(): EntityDraft {
  return {
    name: '',
    prompt: '',
    targetKV: 500,
    seed: null,
    root: null,
  };
}

// --- Step 1: Intake ---
function IntakeStep({
  draft,
  onChange,
  campaignId,
  onGeneratePrompt,
  generatingPrompt,
}: {
  draft: EntityDraft;
  onChange: (updates: Partial<EntityDraft>) => void;
  campaignId: string;
  onGeneratePrompt: () => void;
  generatingPrompt: boolean;
}) {
  const activePreset = KV_PRESETS.find(p => p.value === draft.targetKV);

  return (
    <div className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-[13px] font-[family-name:var(--font-terminal)] tracking-[0.15em] uppercase mb-1"
          style={{ color: '#3EB89A' }}
        >
          Entity Name <span className="text-[#E8585A]">*</span>
        </label>
        <input
          type="text"
          value={draft.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="Who are you bringing into the world?"
          maxLength={100}
          autoFocus
          className="w-full border px-4 py-3 text-white text-lg font-[family-name:var(--font-header)] tracking-wider focus:outline-none placeholder:text-white/10"
          style={{
            background: 'rgba(0,0,0,0.5)',
            borderColor: draft.name ? '#3EB89A44' : 'rgba(255,255,255,0.08)',
          }}
        />
      </div>

      {/* Prompt */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[13px] font-[family-name:var(--font-terminal)] tracking-[0.15em] uppercase"
            style={{ color: '#3EB89A' }}
          >
            Description Prompt
          </label>
          <button
            onClick={onGeneratePrompt}
            disabled={generatingPrompt}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border transition-colors hover:brightness-125"
            style={{
              borderColor: '#D4A830',
              color: generatingPrompt ? '#D4A83088' : '#D4A830',
              background: 'rgba(212,168,48,0.12)',
            }}
          >
            {generatingPrompt ? (
              <>⟳ Generating...</>
            ) : (
              <>✦ Generate Prompt</>
            )}
          </button>
        </div>
        <textarea
          value={draft.prompt}
          onChange={e => onChange({ prompt: e.target.value })}
          placeholder={"Describe this entity in as much detail as you want.\n\nBackground, personality, abilities, role in your campaign, relationships to other entities...\n\nThe more detail you provide, the better we can build out their sheet."}
          rows={8}
          maxLength={5000}
          className="w-full border px-4 py-3 text-[13px] font-[family-name:var(--font-terminal)] leading-relaxed resize-none focus:outline-none placeholder:text-white/10"
          style={{
            background: 'rgba(0,0,0,0.5)',
            borderColor: draft.prompt ? '#3EB89A33' : 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.8)',
          }}
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/30">
            PC backstory import coming soon
          </span>
          <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/30">
            {draft.prompt.length}/5000
          </span>
        </div>
      </div>

      {/* Target KV */}
      <div>
        <label className="block text-[13px] font-[family-name:var(--font-terminal)] tracking-[0.15em] uppercase mb-2"
          style={{ color: '#3EB89A' }}
        >
          Power Level
          <span className="ml-2 normal-case tracking-normal text-white/20">(target Ҝ value)</span>
        </label>
        <div className="flex gap-2 mb-3">
          {KV_PRESETS.map(preset => (
            <button
              key={preset.value}
              onClick={() => onChange({ targetKV: preset.value })}
              className="flex-1 py-2 px-2 text-center border transition-all"
              style={{
                borderColor: draft.targetKV === preset.value ? '#D4A830' : 'rgba(255,255,255,0.06)',
                background: draft.targetKV === preset.value ? 'rgba(212,168,48,0.1)' : 'rgba(0,0,0,0.3)',
              }}
            >
              <div className="text-[13px] font-[family-name:var(--font-header)] tracking-wider"
                style={{ color: draft.targetKV === preset.value ? '#D4A830' : 'rgba(255,255,255,0.4)' }}
              >
                {preset.label.toUpperCase()}
              </div>
              <div className="text-[12px] font-[family-name:var(--font-terminal)] mt-0.5"
                style={{ color: draft.targetKV === preset.value ? '#D4A830AA' : 'rgba(255,255,255,0.15)' }}
              >
                ~{preset.value.toLocaleString()} Ҝ
              </div>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={100}
            max={5000}
            step={50}
            value={draft.targetKV}
            onChange={e => onChange({ targetKV: Number(e.target.value) })}
            className="flex-1 accent-[#D4A830]"
          />
          <div className="flex items-center gap-1 min-w-[80px] justify-end">
            <span className="text-[14px] font-[family-name:var(--font-soul)]" style={{ color: '#D4A830', fontWeight: 900 }}>
              Ҝ
            </span>
            <input
              type="number"
              min={50}
              max={10000}
              value={draft.targetKV}
              onChange={e => onChange({ targetKV: Math.max(50, Math.min(10000, Number(e.target.value) || 50)) })}
              className="w-[60px] bg-transparent border-b text-[14px] font-[family-name:var(--font-header)] text-right focus:outline-none"
              style={{ borderColor: '#D4A83066', color: '#D4A830' }}
            />
          </div>
        </div>
        {activePreset && (
          <div className="text-[12px] font-[family-name:var(--font-terminal)] mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {activePreset.description}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Step 2: Seed Selection ---
function SeedStep({
  draft,
  onChange,
}: {
  draft: EntityDraft;
  onChange: (updates: Partial<EntityDraft>) => void;
}) {
  const [search, setSearch] = useState('');
  const [dieFilter, setDieFilter] = useState<FateDie | 'all'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'kv-asc' | 'kv-desc'>('name');
  const [expandedSeed, setExpandedSeed] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let seeds = [...SEED_CATALOG];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      seeds = seeds.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    }

    // Die filter
    if (dieFilter !== 'all') {
      seeds = seeds.filter(s => s.baseFateDie === dieFilter);
    }

    // Sort
    if (sortBy === 'kv-asc') seeds.sort((a, b) => a.seedKV - b.seedKV);
    else if (sortBy === 'kv-desc') seeds.sort((a, b) => b.seedKV - a.seedKV);
    else seeds.sort((a, b) => a.name.localeCompare(b.name));

    return seeds;
  }, [search, dieFilter, sortBy]);

  const ATTR_LABELS: { key: keyof GrowthSeed['attributes']; label: string; pillar: string }[] = [
    { key: 'clout', label: 'CLT AUG', pillar: '#E8585A' },
    { key: 'celerity', label: 'CEL AUG', pillar: '#E8585A' },
    { key: 'constitution', label: 'CON AUG', pillar: '#E8585A' },
    { key: 'flow', label: 'FLO AUG', pillar: '#7050A8' },
    { key: 'focus', label: 'FOC AUG', pillar: '#7050A8' },
    { key: 'willpower', label: 'WIL AUG', pillar: '#3E78C0' },
    { key: 'wisdom', label: 'WIS AUG', pillar: '#3E78C0' },
    { key: 'wit', label: 'WIT AUG', pillar: '#3E78C0' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search seeds..."
          className="flex-1 border px-3 py-2 text-[13px] font-[family-name:var(--font-terminal)] focus:outline-none placeholder:text-white/20"
          style={{
            background: 'rgba(0,0,0,0.4)',
            borderColor: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.8)',
          }}
        />

        {/* Fate die filter */}
        <div className="flex items-center gap-1">
          {(['all', 'd4', 'd6', 'd8', 'd12', 'd20'] as const).map(die => (
            <button
              key={die}
              onClick={() => setDieFilter(die)}
              className="px-2 py-1.5 text-[12px] font-[family-name:var(--font-terminal)] uppercase border transition-all"
              style={{
                borderColor: dieFilter === die ? '#3EB89A' : 'rgba(255,255,255,0.06)',
                background: dieFilter === die ? 'rgba(62,184,154,0.12)' : 'transparent',
                color: dieFilter === die ? '#3EB89A' : 'rgba(255,255,255,0.3)',
              }}
            >
              {die === 'all' ? 'All' : die}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="border px-2 py-1.5 text-[12px] font-[family-name:var(--font-terminal)] focus:outline-none"
          style={{
            background: 'rgba(0,0,0,0.4)',
            borderColor: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          <option value="name">Name A-Z</option>
          <option value="kv-asc">Ҝ Low → High</option>
          <option value="kv-desc">Ҝ High → Low</option>
        </select>
      </div>

      {/* Results count */}
      <div className="text-[12px] font-[family-name:var(--font-terminal)] text-white/30">
        {filtered.length} seed{filtered.length !== 1 ? 's' : ''}
        {draft.seed && (
          <span style={{ color: '#3EB89A' }}> — Selected: {draft.seed.name}</span>
        )}
      </div>

      {/* Seed list */}
      <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
        {filtered.map(seed => {
          const isSelected = draft.seed?.name === seed.name;
          const isExpanded = expandedSeed === seed.name;
          const totalAttrs = Object.values(seed.attributes).reduce((sum, v) => sum + v, 0);

          return (
            <div key={seed.name}>
              {/* Seed row */}
              <div
                className="flex items-center gap-3 px-3 py-2.5 border cursor-pointer transition-all"
                style={{
                  borderColor: isSelected ? '#3EB89A' : 'rgba(255,255,255,0.06)',
                  background: isSelected ? 'rgba(62,184,154,0.08)' : 'rgba(0,0,0,0.25)',
                  boxShadow: isSelected ? '0 0 12px rgba(62,184,154,0.1)' : 'none',
                }}
                onClick={() => onChange({ seed })}
              >
                {/* Selection indicator */}
                <div className="w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0"
                  style={{
                    borderColor: isSelected ? '#3EB89A' : 'rgba(255,255,255,0.15)',
                    background: isSelected ? '#3EB89A' : 'transparent',
                  }}
                >
                  {isSelected && <span className="text-black text-[10px]">✓</span>}
                </div>

                {/* Name + die */}
                <div className="w-[160px] flex-shrink-0">
                  <div className="text-[14px] font-[family-name:var(--font-header)] tracking-wider"
                    style={{ color: isSelected ? '#3EB89A' : 'rgba(255,255,255,0.8)' }}
                  >
                    {seed.name}
                  </div>
                  <div className="text-[11px] font-[family-name:var(--font-terminal)] text-white/30">
                    {seed.baseFateDie} · Freq {seed.frequency}
                    {seed.skills.length > 0 && (
                      <span style={{ color: '#3EB89A88' }}> · {seed.skills.join(', ')}</span>
                    )}
                  </div>
                </div>

                {/* Attribute bar — compact visual */}
                <div className="flex-1 flex items-center gap-0.5">
                  {ATTR_LABELS.map(a => {
                    const [abbr, aug] = a.label.split(' ');
                    return (
                      <div key={a.key} className="flex-1 text-center">
                        <div className="text-[10px] font-[family-name:var(--font-terminal)] leading-tight" style={{ color: `${a.pillar}88` }}>
                          {abbr}
                        </div>
                        <div className="text-[8px] font-[family-name:var(--font-terminal)] leading-tight" style={{ color: `${a.pillar}55` }}>
                          {aug}
                        </div>
                        <div className="text-[12px] font-[family-name:var(--font-header)]"
                          style={{ color: seed.attributes[a.key] > 10 ? a.pillar : 'rgba(255,255,255,0.4)' }}
                        >
                          {seed.attributes[a.key]}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* KV */}
                <div className="w-[70px] text-right flex-shrink-0">
                  <span className="text-[14px] font-[family-name:var(--font-header)]" style={{ color: '#D4A830' }}>
                    {seed.seedKV.toLocaleString()}
                  </span>
                  <div className="text-[10px] font-[family-name:var(--font-terminal)]" style={{ color: '#D4A83066' }}>Ҝ</div>
                </div>

                {/* Expand toggle */}
                <button
                  onClick={e => { e.stopPropagation(); setExpandedSeed(isExpanded ? null : seed.name); }}
                  className="text-white/30 hover:text-white/60 text-[13px] px-1 transition-colors"
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mx-3 px-4 py-3 border-x border-b space-y-3"
                  style={{
                    borderColor: isSelected ? '#3EB89A44' : 'rgba(255,255,255,0.04)',
                    background: 'rgba(0,0,0,0.35)',
                  }}
                >
                  <div className="text-[13px] font-[family-name:var(--font-terminal)] text-white/60 leading-relaxed">
                    {seed.description}
                  </div>

                  <div className="flex gap-6 text-[12px] font-[family-name:var(--font-terminal)]">
                    <div>
                      <span className="text-white/30 uppercase tracking-wider">Resist </span>
                      <span className="text-white/60">{seed.baseResist}</span>
                    </div>
                    <div>
                      <span className="text-white/30 uppercase tracking-wider">Attr Total </span>
                      <span className="text-white/60">{totalAttrs}</span>
                    </div>
                  </div>

                  {/* Skills / Nectars / Thorns */}
                  <div className="flex gap-4 flex-wrap">
                    {seed.skills.length > 0 && (
                      <div>
                        <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/30 uppercase tracking-wider">Skills: </span>
                        {seed.skills.map(s => (
                          <span key={s} className="text-[12px] font-[family-name:var(--font-terminal)] mr-2" style={{ color: '#3EB89A' }}>{s}</span>
                        ))}
                      </div>
                    )}
                    {seed.nectars.length > 0 && (
                      <div>
                        <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/30 uppercase tracking-wider">Nectars: </span>
                        {seed.nectars.map(n => (
                          <span key={n} className="text-[12px] font-[family-name:var(--font-terminal)] mr-2" style={{ color: '#4ade80' }}>{n}</span>
                        ))}
                      </div>
                    )}
                    {seed.thorns.length > 0 && (
                      <div>
                        <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/30 uppercase tracking-wider">Thorns: </span>
                        {seed.thorns.map(t => (
                          <span key={t} className="text-[12px] font-[family-name:var(--font-terminal)] mr-2" style={{ color: '#E8585A' }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Step 3: Root (placeholder — will browse campaign forge blocks) ---
function RootStep({
  draft,
  onChange,
  campaignId,
}: {
  draft: EntityDraft;
  onChange: (updates: Partial<EntityDraft>) => void;
  campaignId: string;
}) {
  const [roots, setRoots] = useState<Array<{ id: string; name: string; type: string; data: Record<string, unknown>; status: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRoots() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/forge?type=root&status=published`);
        if (res.ok) {
          const data = await res.json();
          setRoots(data.items || []);
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    fetchRoots();
  }, [campaignId]);

  const selectRoot = (item: typeof roots[number]) => {
    onChange({ root: { id: item.id, name: item.name, type: item.type, data: item.data } });
  };

  const attrs = draft.root?.data?.attributes as Record<string, number> | undefined;
  const skills = draft.root?.data?.skills as Array<{ name: string; level: number }> | undefined;
  const nectars = draft.root?.data?.nectars as string[] | undefined;
  const thorns = draft.root?.data?.thorns as string[] | undefined;

  return (
    <div className="space-y-4">
      <div className="text-[13px] font-[family-name:var(--font-terminal)] text-white/40 leading-relaxed">
        Select a root from your campaign&apos;s published forge items. Roots define occupation, background, and starting skills.
      </div>

      {draft.root ? (
        <div className="border p-4 space-y-3" style={{ borderColor: '#3E78C0', background: 'rgba(62,120,192,0.08)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-[family-name:var(--font-header)] tracking-wider" style={{ color: '#3E78C0' }}>
                {draft.root.name}
              </div>
              <div className="text-[12px] font-[family-name:var(--font-terminal)] text-white/40 mt-1">
                {(draft.root.data?.description as string) || 'No description'}
              </div>
            </div>
            <button
              onClick={() => onChange({ root: null })}
              className="text-white/30 hover:text-[#E8585A] transition-colors text-[13px]"
            >
              ✕ Remove
            </button>
          </div>
          {/* Stat preview */}
          {attrs && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(attrs).filter(([, v]) => v > 0).map(([attr, val]) => (
                <span key={attr} className="text-[11px] px-1.5 py-0.5 uppercase" style={{
                  backgroundColor: 'rgba(62,120,192,0.15)',
                  color: '#3E78C0',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                }}>{attr.slice(0, 3)} {val}</span>
              ))}
            </div>
          )}
          {skills && skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {skills.map((s, i) => (
                <span key={i} className="text-[11px] px-1.5 py-0.5" style={{
                  backgroundColor: 'rgba(255,204,120,0.1)',
                  color: '#ffcc78',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}>{s.name} ({s.level})</span>
              ))}
            </div>
          )}
          {nectars && nectars.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {nectars.map((n, i) => (
                <span key={i} className="text-[11px] px-1.5 py-0.5" style={{
                  backgroundColor: 'rgba(62,184,154,0.1)', color: '#3EB89A', borderRadius: '2px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}>{n}</span>
              ))}
            </div>
          )}
          {thorns && thorns.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {thorns.map((t, i) => (
                <span key={i} className="text-[11px] px-1.5 py-0.5" style={{
                  backgroundColor: 'rgba(232,88,90,0.1)', color: '#E8585A', borderRadius: '2px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="text-center py-8 text-[13px] font-[family-name:var(--font-terminal)] text-white/20">
          Loading roots...
        </div>
      ) : roots.length === 0 ? (
        <div className="text-center py-12 border border-dashed" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <div className="text-[14px] font-[family-name:var(--font-terminal)] text-white/20 mb-2">
            No published roots
          </div>
          <div className="text-[12px] font-[family-name:var(--font-terminal)] text-white/15">
            Create roots in the Forge tab using Kai&apos;s authoring pipeline.
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          {roots.map(item => {
            const desc = item.data?.description as string | undefined;
            const freq = item.data?.frequency as number | undefined;
            return (
              <button
                key={item.id}
                onClick={() => selectRoot(item)}
                className="w-full text-left p-3 border transition-colors hover:border-[#3E78C0]"
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  backgroundColor: '#1a1a2e',
                  borderRadius: '2px',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-[family-name:var(--font-header)] tracking-wider" style={{ color: '#3E78C0' }}>
                    {item.name}
                  </span>
                  {freq != null && (
                    <span className="text-[12px] font-[family-name:var(--font-terminal)]" style={{ color: '#7050A8' }}>
                      Freq: {freq}
                    </span>
                  )}
                </div>
                {desc && (
                  <div className="text-[12px] font-[family-name:var(--font-terminal)] text-white/35 mt-1 truncate">
                    {desc}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Main Wizard ---
export default function EntityCreationWizard({ campaignId, entityId, onCancel, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<EntityDraft>(createEmptyDraft);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const currentStep = STEPS[step];

  // Load existing draft on mount
  useEffect(() => {
    async function loadDraft() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/entities/${entityId}`);
        if (!res.ok) return;
        const data = await res.json();
        const wizardDraft = data.data?._wizardDraft;
        const charData = data.data || {};

        setDraft({
          name: data.name || '',
          prompt: wizardDraft?.prompt || '',
          targetKV: wizardDraft?.targetKV || 500,
          seed: charData.creation?.seed?.name ? (getSeed(charData.creation.seed.name) || null) : null,
          root: charData.creation?.root || null,
        });

        if (typeof wizardDraft?.step === 'number') {
          setStep(wizardDraft.step);
        }
      } catch { /* new draft, use defaults */ }
      finally { setLoaded(true); }
    }
    loadDraft();
  }, [campaignId, entityId]);

  const updateDraft = (updates: Partial<EntityDraft>) => {
    setDraft(prev => ({ ...prev, ...updates }));
  };

  // Save current step data to server
  const saveStep = useCallback(async (currentDraft: EntityDraft, targetStep: number) => {
    setSaving(true);
    try {
      const characterData: Record<string, unknown> = {};

      // Map draft fields into character data based on what's been filled
      if (currentDraft.seed) {
        characterData.creation = {
          seed: {
            name: currentDraft.seed.name,
            description: currentDraft.seed.description,
            baseFateDie: currentDraft.seed.baseFateDie,
          },
          root: currentDraft.root || undefined,
        };
      }

      await fetch(`/api/campaigns/${campaignId}/entities/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: targetStep,
          name: currentDraft.name || 'New Entity',
          prompt: currentDraft.prompt,
          targetKV: currentDraft.targetKV,
          characterData,
        }),
      });
    } finally {
      setSaving(false);
    }
  }, [campaignId, entityId]);

  const canAdvance = (): boolean => {
    if (step === 0) return draft.name.trim().length > 0;
    if (step === 1) return draft.seed !== null;
    if (step === 2) return draft.root !== null;
    return true;
  };

  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    try {
      // TODO: Wire to endpoint that reads campaign context
      await new Promise(r => setTimeout(r, 1500));
      updateDraft({
        prompt: draft.prompt + (draft.prompt ? '\n\n' : '') +
          '[Prompt generation will use campaign context — entities, setting, relationships — to help craft this description]',
      });
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleStepChange = async (newStep: number) => {
    await saveStep(draft, newStep);
    setStep(newStep);
  };

  const handleNext = () => {
    if (step === 0 && draft.prompt.trim()) {
      // TODO: Generate builds out steps 2-8 from the prompt
    }
    handleStepChange(step + 1);
  };

  if (!loaded) {
    return (
      <div className="text-center py-20 text-white/30 text-[13px] font-[family-name:var(--font-terminal)]">
        Loading draft...
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center border"
            style={{ borderColor: '#3EB89A44', background: 'rgba(62,184,154,0.08)' }}
          >
            <span className="text-[14px]" style={{ color: '#3EB89A' }}>◈</span>
          </div>
          <h1 className="text-xl font-[family-name:var(--font-header)] tracking-[0.15em]"
            style={{ color: '#3EB89A' }}
          >
            CREATE ENTITY
          </h1>
          {saving && (
            <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/20 ml-3">
              saving...
            </span>
          )}
        </div>
        <button
          onClick={async () => { await saveStep(draft, step); onCancel(); }}
          className="w-8 h-8 flex items-center justify-center border text-white/30 hover:text-[#E8585A] hover:border-[#E8585A]/40 transition-colors"
          style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)' }}
        >
          ✕
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0.5 mb-6 p-1" style={{ background: 'rgba(0,0,0,0.3)' }}>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => i < step && handleStepChange(i)}
            disabled={i > step}
            className="flex-1 py-1.5 text-center transition-all"
            style={{
              background: i === step
                ? 'rgba(62,184,154,0.15)'
                : i < step
                  ? 'rgba(62,184,154,0.05)'
                  : 'transparent',
              borderBottom: i === step ? '2px solid #3EB89A' : '2px solid transparent',
            }}
          >
            <span className={`text-[11px] font-[family-name:var(--font-terminal)] tracking-[0.1em] uppercase ${
              i === step
                ? 'text-[#3EB89A]'
                : i < step
                  ? 'text-white/40 cursor-pointer'
                  : 'text-white/30 cursor-default'
            }`}>
              {s.label}
            </span>
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="border p-6"
        style={{
          background: 'rgba(0,0,0,0.4)',
          borderColor: '#3EB89A22',
          boxShadow: '0 0 40px rgba(62,184,154,0.03)',
        }}
      >
        {/* Step title */}
        <div className="flex items-center gap-3 mb-6 pb-3"
          style={{ borderBottom: '1px solid rgba(62,184,154,0.1)' }}
        >
          <span className="text-[11px] font-[family-name:var(--font-terminal)]"
            style={{ color: '#3EB89A88' }}
          >
            {String(step + 1).padStart(2, '0')}
          </span>
          <span className="text-sm font-[family-name:var(--font-header)] tracking-[0.15em] uppercase"
            style={{ color: '#3EB89A' }}
          >
            {currentStep.label}
          </span>
          {step === 0 && (
            <span className="ml-auto text-[11px] font-[family-name:var(--font-terminal)] text-white/30 tracking-wider">
              ENTITY://creation.intake
            </span>
          )}
        </div>

        {/* Render current step */}
        {step === 0 && (
          <IntakeStep
            draft={draft}
            onChange={updateDraft}
            campaignId={campaignId}
            onGeneratePrompt={handleGeneratePrompt}
            generatingPrompt={generatingPrompt}
          />
        )}
        {step === 1 && (
          <SeedStep draft={draft} onChange={updateDraft} />
        )}
        {step === 2 && (
          <RootStep draft={draft} onChange={updateDraft} campaignId={campaignId} />
        )}
        {step > 2 && (
          <div className="text-center py-12 text-white/20 text-[13px] font-[family-name:var(--font-terminal)]">
            Step {step + 1}: {currentStep.label} — coming next
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={() => handleStepChange(step - 1)}
          disabled={step === 0}
          className="px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border text-white/40 hover:text-white/60 hover:border-white/25 disabled:opacity-20 disabled:cursor-default transition-colors"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        >
          ‹ Back
        </button>

        <div className="flex items-center gap-3">
          {/* Manual skip option on Step 1 */}
          {step === 0 && draft.name.trim() && (
            <button
              onClick={() => handleStepChange(1)}
              className="px-4 py-2 text-[11px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border text-white/50 hover:text-white/70 hover:border-white/30 transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.03)' }}
            >
              Manual Creation ›
            </button>
          )}

          <button
            onClick={handleNext}
            disabled={!canAdvance() || step === STEPS.length - 1}
            className="px-6 py-2.5 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] font-bold disabled:opacity-30 disabled:cursor-default transition-all hover:brightness-110"
            style={{
              background: canAdvance() && step < STEPS.length - 1
                ? 'linear-gradient(135deg, #3EB89A, #2D9A7E)'
                : 'rgba(62,184,154,0.3)',
              color: '#000',
              boxShadow: canAdvance() && step < STEPS.length - 1
                ? '0 0 20px rgba(62,184,154,0.25)'
                : 'none',
            }}
          >
            {step === 0 && draft.prompt.trim() ? 'Generate ›' : 'Next ›'}
          </button>
        </div>
      </div>
    </div>
  );
}
