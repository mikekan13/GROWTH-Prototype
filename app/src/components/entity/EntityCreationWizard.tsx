'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { SEED_CATALOG, FATE_DIE_VALUE, getSeed } from '@/lib/seed-catalog';
import type { GrowthSeed, FateDie, SkillGovernor } from '@/types/growth';
import { PILLARS } from '@/types/growth';

// --- Wizard state shape ---
// ForgeBlock = a selected forge item (root, branch, skill, trait, etc.)
export interface ForgeBlock {
  id: string;
  name: string;
  type: string;
  data: Record<string, unknown>;
}

export type AttributeName =
  | 'clout' | 'celerity' | 'constitution'
  | 'flow' | 'frequency' | 'focus'
  | 'willpower' | 'wisdom' | 'wit';

export interface DraftSkill {
  name: string;
  level: number;
  governors: SkillGovernor[];
  description?: string;
  forgeItemId?: string;
}

export interface DraftTrait {
  name: string;
  type: 'nectar' | 'thorn';
  description?: string;
  pillar?: 'body' | 'spirit' | 'soul';
  mechanicalEffect?: string;
  forgeItemId?: string;
}

export interface DraftGoal {
  description: string;
  priority: number; // 1-5
}

export interface EntityDraft {
  // Step 1: Intake
  name: string;
  prompt: string;
  targetKV: number;
  // Step 2: Seed
  seed: GrowthSeed | null;
  // Step 3: Root + Branches (selected from campaign forge)
  root: ForgeBlock | null;
  branches: ForgeBlock[];
  // Step 4: Attribute levels (1-20)
  attributes: Record<AttributeName, number>;
  // Step 5: Selected skills
  skills: DraftSkill[];
  // Step 6: Selected nectars + thorns
  traits: DraftTrait[];
  // Step 7: Initial goals (max 5)
  goals: DraftGoal[];
}

const STEPS = [
  { key: 'intake', label: 'Describe' },
  { key: 'seed', label: 'Seed' },
  { key: 'roots', label: 'Root & Branches' },
  { key: 'attributes', label: 'Attributes' },
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

const DEFAULT_ATTRIBUTES: Record<AttributeName, number> = {
  clout: 1, celerity: 1, constitution: 1,
  flow: 1, frequency: 1, focus: 1,
  willpower: 1, wisdom: 1, wit: 1,
};

function createEmptyDraft(): EntityDraft {
  return {
    name: '',
    prompt: '',
    targetKV: 500,
    seed: null,
    root: null,
    branches: [],
    attributes: { ...DEFAULT_ATTRIBUTES },
    skills: [],
    traits: [],
    goals: [],
  };
}

// KRMA cost constants — mirror lib/kv-calculator.ts
const KV_PER_ATTR = 1;
const KV_PER_SKILL = 1;

function computeRunningKV(draft: EntityDraft): number {
  const attrSum = Object.values(draft.attributes).reduce((s, v) => s + v, 0);
  const skillSum = draft.skills.reduce((s, sk) => s + sk.level, 0);
  const fateDie = (draft.seed?.baseFateDie ?? 'd6');
  const fateKV = FATE_DIE_VALUE[fateDie] ?? 10;
  return attrSum * KV_PER_ATTR + skillSum * KV_PER_SKILL + fateKV;
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
    { key: 'flow', label: 'FLO AUG', pillar: '#582a72' },
    { key: 'focus', label: 'FOC AUG', pillar: '#582a72' },
    { key: 'willpower', label: 'WIL AUG', pillar: '#002f6c' },
    { key: 'wisdom', label: 'WIS AUG', pillar: '#002f6c' },
    { key: 'wit', label: 'WIT AUG', pillar: '#002f6c' },
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
        <div className="border p-4 space-y-3" style={{ borderColor: '#22ab94', background: 'rgba(34, 171, 148, 0.08)' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-[family-name:var(--font-header)] tracking-wider" style={{ color: '#22ab94' }}>
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
                  backgroundColor: 'rgba(34, 171, 148, 0.15)',
                  color: '#22ab94',
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
                className="w-full text-left p-3 border transition-colors hover:border-[#22ab94]"
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  backgroundColor: '#1a1a2e',
                  borderRadius: '2px',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-[family-name:var(--font-header)] tracking-wider" style={{ color: '#22ab94' }}>
                    {item.name}
                  </span>
                  {freq != null && (
                    <span className="text-[12px] font-[family-name:var(--font-terminal)]" style={{ color: '#8e7cc3' }}>
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

// --- Step 3 (companion): Branches multi-select ---
function BranchesPanel({
  draft,
  onChange,
  campaignId,
}: {
  draft: EntityDraft;
  onChange: (updates: Partial<EntityDraft>) => void;
  campaignId: string;
}) {
  const [branches, setBranches] = useState<Array<{ id: string; name: string; type: string; data: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBranches() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/forge?type=branch&status=published`);
        if (res.ok) {
          const data = await res.json();
          setBranches(data.items || []);
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    fetchBranches();
  }, [campaignId]);

  const selectedIds = new Set(draft.branches.map(b => b.id));
  const toggle = (item: typeof branches[number]) => {
    if (selectedIds.has(item.id)) {
      onChange({ branches: draft.branches.filter(b => b.id !== item.id) });
    } else {
      onChange({
        branches: [
          ...draft.branches,
          { id: item.id, name: item.name, type: item.type, data: item.data },
        ],
      });
    }
  };

  return (
    <div className="mt-6 pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-[12px] font-[family-name:var(--font-terminal)] uppercase tracking-[0.15em] text-white/40">
          Branches <span className="text-white/20">(optional)</span>
        </span>
        <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/30">
          {draft.branches.length} selected
        </span>
      </div>
      {loading ? (
        <div className="text-center py-6 text-[12px] text-white/20 font-[family-name:var(--font-terminal)]">Loading branches...</div>
      ) : branches.length === 0 ? (
        <div className="text-center py-4 text-[11px] text-white/20 font-[family-name:var(--font-terminal)]">
          No published branches in this campaign.
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {branches.map(b => {
            const sel = selectedIds.has(b.id);
            return (
              <button
                key={b.id}
                onClick={() => toggle(b)}
                className="px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] font-[family-name:var(--font-terminal)] border transition-colors"
                style={{
                  borderColor: sel ? '#22ab94' : 'rgba(255,255,255,0.12)',
                  background: sel ? 'rgba(34, 171, 148, 0.18)' : 'rgba(0,0,0,0.3)',
                  color: sel ? '#22ab94' : 'rgba(255,255,255,0.5)',
                }}
              >
                {b.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Step 4: Attributes ---
function AttributesStep({
  draft,
  onChange,
}: {
  draft: EntityDraft;
  onChange: (updates: Partial<EntityDraft>) => void;
}) {
  const setAttr = (name: AttributeName, value: number) => {
    const clamped = Math.max(1, Math.min(20, Math.floor(value)));
    onChange({ attributes: { ...draft.attributes, [name]: clamped } });
  };

  const attrTotal = Object.values(draft.attributes).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">
      <div className="text-[13px] font-[family-name:var(--font-terminal)] text-white/40 leading-relaxed">
        Tune each attribute (1-20). Each level costs 1 KRMA. Seed augments apply on top at crystallization.
      </div>

      {(['body', 'spirit', 'soul'] as const).map(pillarKey => {
        const pillar = PILLARS[pillarKey];
        return (
          <div key={pillarKey} className="border p-4" style={{ borderColor: `${pillar.color}33`, background: 'rgba(0,0,0,0.2)' }}>
            <div className="flex items-baseline gap-2 mb-3">
              <span
                className="text-[12px] font-[family-name:var(--font-header)] tracking-[0.2em] uppercase"
                style={{ color: pillar.color }}
              >
                {pillar.name}
              </span>
              <span className="text-[10px] font-[family-name:var(--font-terminal)] text-white/30 uppercase">
                {pillar.alchemical}
              </span>
            </div>

            <div className="space-y-2">
              {pillar.attributes.map(attrName => {
                const level = draft.attributes[attrName as AttributeName];
                const seedAug = (draft.seed?.attributes?.[attrName as keyof GrowthSeed['attributes']] ?? 0);
                return (
                  <div key={attrName} className="flex items-center gap-3">
                    <label className="text-[12px] font-[family-name:var(--font-terminal)] uppercase tracking-[0.1em] text-white/60 w-28">
                      {attrName}
                    </label>
                    <button
                      onClick={() => setAttr(attrName as AttributeName, level - 1)}
                      disabled={level <= 1}
                      className="w-7 h-7 text-[14px] border text-white/60 disabled:opacity-25 hover:text-white transition-colors"
                      style={{ borderColor: 'rgba(255,255,255,0.15)' }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={level}
                      onChange={(e) => setAttr(attrName as AttributeName, Number(e.target.value) || 1)}
                      className="w-14 px-2 py-1 text-center text-[13px] font-[family-name:var(--font-bebas-neue)] bg-black/40 border text-white"
                      style={{ borderColor: `${pillar.color}55` }}
                    />
                    <button
                      onClick={() => setAttr(attrName as AttributeName, level + 1)}
                      disabled={level >= 20}
                      className="w-7 h-7 text-[14px] border text-white/60 disabled:opacity-25 hover:text-white transition-colors"
                      style={{ borderColor: 'rgba(255,255,255,0.15)' }}
                    >
                      +
                    </button>
                    {seedAug > 0 && (
                      <span className="text-[10px] font-[family-name:var(--font-terminal)] text-white/40 ml-1">
                        +{seedAug} from seed
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex items-center justify-between p-3 border" style={{ borderColor: 'rgba(255,204,120,0.25)', background: 'rgba(255,204,120,0.04)' }}>
        <span className="text-[12px] font-[family-name:var(--font-terminal)] uppercase tracking-[0.12em] text-[#ffcc78]">
          Attribute Total
        </span>
        <span className="text-[18px] font-[family-name:var(--font-bebas-neue)] text-[#ffcc78]">
          {attrTotal} <span className="text-[12px] text-white/40">Ҝ</span>
        </span>
      </div>
    </div>
  );
}

// --- Step 5: Skills ---
function SkillsStep({
  draft,
  onChange,
  campaignId,
}: {
  draft: EntityDraft;
  onChange: (updates: Partial<EntityDraft>) => void;
  campaignId: string;
}) {
  const [available, setAvailable] = useState<Array<{ id: string; name: string; data: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchSkills() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/forge?type=skill&status=published`);
        if (res.ok) {
          const data = await res.json();
          setAvailable(data.items || []);
        }
      } catch { /* silent */ }
      setLoading(false);
    }
    fetchSkills();
  }, [campaignId]);

  const selectedIds = new Set(draft.skills.map(s => s.forgeItemId).filter(Boolean));

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.toLowerCase();
    return available.filter(s =>
      s.name.toLowerCase().includes(q)
      || (s.data?.description as string)?.toLowerCase().includes(q),
    );
  }, [available, search]);

  const addSkill = (item: typeof available[number]) => {
    const governors = (item.data?.governors as SkillGovernor[]) || ['willpower'];
    const description = item.data?.description as string | undefined;
    onChange({
      skills: [
        ...draft.skills,
        { name: item.name, level: 1, governors, description, forgeItemId: item.id },
      ],
    });
  };

  const updateLevel = (idx: number, level: number) => {
    const clamped = Math.max(1, Math.min(20, Math.floor(level)));
    const next = [...draft.skills];
    next[idx] = { ...next[idx], level: clamped };
    onChange({ skills: next });
  };

  const removeSkill = (idx: number) => {
    onChange({ skills: draft.skills.filter((_, i) => i !== idx) });
  };

  const totalKV = draft.skills.reduce((s, sk) => s + sk.level, 0);

  return (
    <div className="space-y-4">
      <div className="text-[13px] font-[family-name:var(--font-terminal)] text-white/40 leading-relaxed">
        Add skills from published forge items. Each skill level costs 1 KRMA. Magic skills cost 2 KRMA per level.
      </div>

      {/* Selected skills */}
      {draft.skills.length > 0 && (
        <div className="space-y-1.5">
          {draft.skills.map((sk, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 border"
              style={{ borderColor: '#ffcc7833', background: 'rgba(255,204,120,0.05)' }}
            >
              <span className="flex-1 text-[13px] font-[family-name:var(--font-terminal)] text-white/80">
                {sk.name}
              </span>
              <div className="flex gap-0.5">
                {sk.governors.slice(0, 3).map(g => (
                  <span key={g} className="text-[9px] px-1 py-0.5 uppercase font-[family-name:var(--font-terminal)] text-white/50"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    {g.slice(0, 3)}
                  </span>
                ))}
              </div>
              <button
                onClick={() => updateLevel(idx, sk.level - 1)}
                disabled={sk.level <= 1}
                className="w-6 h-6 text-[12px] border text-white/60 disabled:opacity-25"
                style={{ borderColor: 'rgba(255,255,255,0.15)' }}
              >−</button>
              <span className="w-6 text-center text-[13px] font-[family-name:var(--font-bebas-neue)] text-[#ffcc78]">
                {sk.level}
              </span>
              <button
                onClick={() => updateLevel(idx, sk.level + 1)}
                disabled={sk.level >= 20}
                className="w-6 h-6 text-[12px] border text-white/60 disabled:opacity-25"
                style={{ borderColor: 'rgba(255,255,255,0.15)' }}
              >+</button>
              <button
                onClick={() => removeSkill(idx)}
                className="w-6 h-6 text-[12px] text-white/30 hover:text-[#E8585A]"
              >✕</button>
            </div>
          ))}
          <div className="flex items-center justify-between p-2 text-[11px] font-[family-name:var(--font-terminal)] uppercase tracking-[0.1em]"
            style={{ background: 'rgba(255,204,120,0.04)' }}
          >
            <span className="text-white/40">Skill Subtotal</span>
            <span className="text-[#ffcc78]">{totalKV} Ҝ</span>
          </div>
        </div>
      )}

      {/* Available skills */}
      <div className="pt-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search published skills..."
          className="w-full px-3 py-2 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white placeholder:text-white/25"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        />
      </div>

      {loading ? (
        <div className="text-center py-6 text-[12px] text-white/20 font-[family-name:var(--font-terminal)]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 border border-dashed text-[12px] text-white/25 font-[family-name:var(--font-terminal)]"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        >
          {available.length === 0 ? 'No published skills in campaign forge.' : 'No matches.'}
        </div>
      ) : (
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {filtered.map(item => {
            const used = selectedIds.has(item.id);
            const desc = item.data?.description as string | undefined;
            return (
              <button
                key={item.id}
                onClick={() => !used && addSkill(item)}
                disabled={used}
                className="w-full text-left p-2 border transition-colors disabled:opacity-40"
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  background: 'rgba(0,0,0,0.3)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-[family-name:var(--font-terminal)] text-white/80">{item.name}</span>
                  <span className="text-[10px] text-white/30">{used ? 'added' : '+ add'}</span>
                </div>
                {desc && <div className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{desc}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Step 6: Traits (Nectars + Thorns) ---
function TraitsStep({
  draft,
  onChange,
  campaignId,
}: {
  draft: EntityDraft;
  onChange: (updates: Partial<EntityDraft>) => void;
  campaignId: string;
}) {
  const [available, setAvailable] = useState<Array<{ id: string; name: string; type: string; data: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'nectar' | 'thorn'>('nectar');

  useEffect(() => {
    async function fetchTraits() {
      try {
        const [necRes, thornRes] = await Promise.all([
          fetch(`/api/campaigns/${campaignId}/forge?type=nectar&status=published`),
          fetch(`/api/campaigns/${campaignId}/forge?type=thorn&status=published`),
        ]);
        const necData = necRes.ok ? await necRes.json() : { items: [] };
        const thornData = thornRes.ok ? await thornRes.json() : { items: [] };
        setAvailable([
          ...(necData.items || []).map((i: Record<string, unknown>) => ({ ...i, type: 'nectar' as const })),
          ...(thornData.items || []).map((i: Record<string, unknown>) => ({ ...i, type: 'thorn' as const })),
        ]);
      } catch { /* silent */ }
      setLoading(false);
    }
    fetchTraits();
  }, [campaignId]);

  // Cap per design: total nectars + thorns combined ≤ Fate Die value
  const fateDie = draft.seed?.baseFateDie ?? 'd6';
  const cap = FATE_DIE_VALUE[fateDie] ?? 10;
  const traitCount = draft.traits.length;

  const selectedIds = new Set(draft.traits.map(t => t.forgeItemId).filter(Boolean));
  const filtered = available.filter(a => a.type === tab);

  const addTrait = (item: typeof available[number]) => {
    if (traitCount >= cap) return;
    const pillar = (item.data?.pillar as 'body' | 'spirit' | 'soul' | undefined);
    const description = item.data?.description as string | undefined;
    const mechanicalEffect = item.data?.mechanicalEffect as string | undefined;
    onChange({
      traits: [
        ...draft.traits,
        {
          name: item.name,
          type: item.type as 'nectar' | 'thorn',
          description,
          pillar,
          mechanicalEffect,
          forgeItemId: item.id,
        },
      ],
    });
  };

  const removeTrait = (idx: number) => {
    onChange({ traits: draft.traits.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-[family-name:var(--font-terminal)] text-white/40 leading-relaxed">
          Nectars + Thorns cap at Fate Die value: <span className="text-[#ffcc78]">{cap}</span> ({fateDie})
        </div>
        <div className="text-[12px] font-[family-name:var(--font-terminal)] text-white/50">
          {traitCount} / {cap}
        </div>
      </div>

      {/* Selected traits */}
      {draft.traits.length > 0 && (
        <div className="space-y-1.5">
          {draft.traits.map((tr, idx) => {
            const color = tr.type === 'nectar' ? '#3EB89A' : '#E8585A';
            return (
              <div key={idx} className="flex items-start gap-2 p-2 border"
                style={{ borderColor: `${color}33`, background: `${color}0a` }}
              >
                <span className="text-[10px] px-1.5 py-0.5 uppercase font-[family-name:var(--font-terminal)] mt-0.5"
                  style={{ background: `${color}22`, color }}
                >
                  {tr.type}
                </span>
                <div className="flex-1">
                  <div className="text-[13px] font-[family-name:var(--font-terminal)] text-white/80">{tr.name}</div>
                  {tr.mechanicalEffect && (
                    <div className="text-[11px] text-white/50 mt-0.5">{tr.mechanicalEffect}</div>
                  )}
                </div>
                {tr.pillar && (
                  <span className="text-[9px] uppercase font-[family-name:var(--font-terminal)] text-white/40 mt-1">
                    {tr.pillar}
                  </span>
                )}
                <button
                  onClick={() => removeTrait(idx)}
                  className="w-6 h-6 text-[12px] text-white/30 hover:text-[#E8585A]"
                >✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {(['nectar', 'thorn'] as const).map(t => {
          const color = t === 'nectar' ? '#3EB89A' : '#E8585A';
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] transition-colors"
              style={{
                color: tab === t ? color : 'rgba(255,255,255,0.4)',
                borderBottom: tab === t ? `2px solid ${color}` : '2px solid transparent',
              }}
            >
              {t}s
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center py-6 text-[12px] text-white/20 font-[family-name:var(--font-terminal)]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 border border-dashed text-[12px] text-white/25 font-[family-name:var(--font-terminal)]"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        >
          No published {tab}s.
        </div>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {filtered.map(item => {
            const used = selectedIds.has(item.id);
            const desc = item.data?.description as string | undefined;
            const atCap = traitCount >= cap;
            const disabled = used || atCap;
            return (
              <button
                key={item.id}
                onClick={() => !disabled && addTrait(item)}
                disabled={disabled}
                className="w-full text-left p-2 border transition-colors disabled:opacity-40"
                style={{
                  borderColor: 'rgba(255,255,255,0.08)',
                  background: 'rgba(0,0,0,0.3)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-[family-name:var(--font-terminal)] text-white/80">{item.name}</span>
                  <span className="text-[10px] text-white/30">
                    {used ? 'added' : atCap ? 'cap' : '+ add'}
                  </span>
                </div>
                {desc && <div className="text-[11px] text-white/40 mt-0.5 line-clamp-1">{desc}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// --- Step 7: Goals ---
function GoalsStep({
  draft,
  onChange,
}: {
  draft: EntityDraft;
  onChange: (updates: Partial<EntityDraft>) => void;
}) {
  const MAX_GOALS = 5;

  const addGoal = () => {
    if (draft.goals.length >= MAX_GOALS) return;
    onChange({ goals: [...draft.goals, { description: '', priority: 3 }] });
  };

  const updateGoal = (idx: number, patch: Partial<DraftGoal>) => {
    const next = [...draft.goals];
    next[idx] = { ...next[idx], ...patch };
    onChange({ goals: next });
  };

  const removeGoal = (idx: number) => {
    onChange({ goals: draft.goals.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-3">
      <div className="text-[13px] font-[family-name:var(--font-terminal)] text-white/40 leading-relaxed">
        Up to {MAX_GOALS} initial goals. Each goal will be tracked through play. Custodian godhead assignment happens after crystallization.
      </div>

      {draft.goals.map((g, idx) => (
        <div key={idx} className="border p-3 space-y-2" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-[family-name:var(--font-terminal)] uppercase tracking-[0.1em] text-white/40 w-12">
              GOAL {idx + 1}
            </span>
            <select
              value={g.priority}
              onChange={(e) => updateGoal(idx, { priority: Number(e.target.value) })}
              className="px-2 py-1 text-[11px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white/70"
              style={{ borderColor: 'rgba(255,255,255,0.15)' }}
            >
              <option value={1}>Priority 1 (highest)</option>
              <option value={2}>Priority 2</option>
              <option value={3}>Priority 3</option>
              <option value={4}>Priority 4</option>
              <option value={5}>Priority 5 (lowest)</option>
            </select>
            <button
              onClick={() => removeGoal(idx)}
              className="ml-auto text-[11px] text-white/30 hover:text-[#E8585A]"
            >✕ remove</button>
          </div>
          <textarea
            value={g.description}
            onChange={(e) => updateGoal(idx, { description: e.target.value })}
            placeholder="What does this entity want? (3-500 chars)"
            rows={2}
            maxLength={500}
            className="w-full px-2 py-1.5 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white placeholder:text-white/25 resize-none"
            style={{ borderColor: 'rgba(255,255,255,0.1)' }}
          />
        </div>
      ))}

      {draft.goals.length < MAX_GOALS && (
        <button
          onClick={addGoal}
          className="w-full py-2.5 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] border border-dashed text-white/40 hover:text-white/70 hover:border-white/30 transition-colors"
          style={{ borderColor: 'rgba(255,255,255,0.15)' }}
        >
          + Add Goal ({draft.goals.length}/{MAX_GOALS})
        </button>
      )}
    </div>
  );
}

// --- Step 8: Review + Crystallize ---
function ReviewStep({
  draft,
  totalKV,
  crystallizing,
  error,
}: {
  draft: EntityDraft;
  totalKV: number;
  crystallizing: boolean;
  error: string | null;
}) {
  const attrSum = Object.values(draft.attributes).reduce((s, v) => s + v, 0);
  const skillSum = draft.skills.reduce((s, sk) => s + sk.level, 0);
  const fateDie = draft.seed?.baseFateDie ?? 'd6';
  const fateKV = FATE_DIE_VALUE[fateDie] ?? 10;
  const traitNectars = draft.traits.filter(t => t.type === 'nectar').length;
  const traitThorns = draft.traits.filter(t => t.type === 'thorn').length;

  return (
    <div className="space-y-4">
      <div className="text-[13px] font-[family-name:var(--font-terminal)] text-white/40 leading-relaxed">
        Review the entity. Crystallize to commit — status moves to APPROVED and the entity becomes available on the canvas.
      </div>

      <div className="border p-4 space-y-3" style={{ borderColor: '#3EB89A33', background: 'rgba(62,184,154,0.04)' }}>
        <div className="flex items-baseline justify-between">
          <span className="text-[16px] font-[family-name:var(--font-header)] tracking-[0.15em] text-white">{draft.name || '(unnamed)'}</span>
          <span className="text-[11px] font-[family-name:var(--font-terminal)] text-white/40 uppercase">
            {draft.seed?.name ?? 'no seed'} · {fateDie}
          </span>
        </div>
        {draft.root && (
          <div className="text-[11px] font-[family-name:var(--font-terminal)] text-white/50">
            Root: <span className="text-[#22ab94]">{draft.root.name}</span>
            {draft.branches.length > 0 && (
              <> · Branches: <span className="text-[#22ab94]">{draft.branches.map(b => b.name).join(', ')}</span></>
            )}
          </div>
        )}
      </div>

      {/* KV breakdown */}
      <div className="border" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <table className="w-full text-[12px] font-[family-name:var(--font-terminal)]">
          <tbody>
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <td className="px-3 py-2 text-white/50 uppercase tracking-[0.1em]">Attributes</td>
              <td className="px-3 py-2 text-right text-white/80">{attrSum} Ҝ</td>
            </tr>
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <td className="px-3 py-2 text-white/50 uppercase tracking-[0.1em]">Skills ({draft.skills.length})</td>
              <td className="px-3 py-2 text-right text-white/80">{skillSum} Ҝ</td>
            </tr>
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <td className="px-3 py-2 text-white/50 uppercase tracking-[0.1em]">Fate Die</td>
              <td className="px-3 py-2 text-right text-white/80">{fateKV} Ҝ <span className="text-white/30">({fateDie})</span></td>
            </tr>
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <td className="px-3 py-2 text-white/50 uppercase tracking-[0.1em]">Traits</td>
              <td className="px-3 py-2 text-right text-white/50">
                {traitNectars} <span className="text-[#3EB89A]">nec</span> · {traitThorns} <span className="text-[#E8585A]">thorn</span>
              </td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-[#ffcc78] uppercase tracking-[0.12em] font-bold">TKV Total</td>
              <td className="px-3 py-2 text-right text-[18px] font-[family-name:var(--font-bebas-neue)] text-[#ffcc78]">
                {totalKV} Ҝ
              </td>
            </tr>
            <tr className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <td className="px-3 py-1.5 text-[10px] text-white/30 uppercase tracking-[0.1em]">Target</td>
              <td className="px-3 py-1.5 text-right text-[11px] text-white/30">
                {draft.targetKV} Ҝ
                {totalKV > draft.targetKV * 1.25 && <span className="ml-2 text-[#E8585A]">over</span>}
                {totalKV < draft.targetKV * 0.6 && <span className="ml-2 text-[#22ab94]">under</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Goals preview */}
      {draft.goals.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-white/40 mb-2 font-[family-name:var(--font-terminal)]">
            Goals ({draft.goals.length})
          </div>
          <div className="space-y-1">
            {draft.goals.map((g, i) => (
              <div key={i} className="text-[12px] text-white/60 font-[family-name:var(--font-terminal)]">
                <span className="text-white/30">P{g.priority}</span> · {g.description || '(empty)'}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="border p-3 text-[12px] font-[family-name:var(--font-terminal)]"
          style={{ borderColor: '#E8585A55', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
        >
          ✗ {error}
        </div>
      )}

      {crystallizing && (
        <div className="text-center py-3 text-[12px] text-[#3EB89A] font-[family-name:var(--font-terminal)] uppercase tracking-[0.15em]">
          Crystallizing...
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
  const [crystallizing, setCrystallizing] = useState(false);
  const [crystallizeError, setCrystallizeError] = useState<string | null>(null);
  const [quickGenError, setQuickGenError] = useState<string | null>(null);
  const [quickGenerating, setQuickGenerating] = useState(false);

  const currentStep = STEPS[step];
  const totalKV = useMemo(() => computeRunningKV(draft), [draft]);

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
          branches: (wizardDraft?.branches as ForgeBlock[]) || [],
          attributes: (wizardDraft?.attributes as Record<AttributeName, number>) || { ...DEFAULT_ATTRIBUTES },
          skills: (wizardDraft?.skills as DraftSkill[]) || [],
          traits: (wizardDraft?.traits as DraftTrait[]) || [],
          goals: (wizardDraft?.goals as DraftGoal[]) || [],
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

      // Stash the rest of the wizard state inside _wizardDraft via the
      // server's merge logic (which preserves unknown _wizardDraft keys).
      // This lets the draft round-trip without polluting character.data.
      const wizardExtra = {
        branches: currentDraft.branches,
        attributes: currentDraft.attributes,
        skills: currentDraft.skills,
        traits: currentDraft.traits,
        goals: currentDraft.goals,
      };

      await fetch(`/api/campaigns/${campaignId}/entities/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: targetStep,
          name: currentDraft.name || 'New Entity',
          prompt: currentDraft.prompt,
          targetKV: currentDraft.targetKV,
          characterData,
          wizardExtra,
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
    if (step === 6) {
      // Goals optional but if present must have description
      return draft.goals.every(g => g.description.trim().length >= 3);
    }
    return true;
  };

  const handleGeneratePrompt = async () => {
    setGeneratingPrompt(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/context`);
      let contextLine = '';
      if (res.ok) {
        const data = await res.json();
        const parts: string[] = [];
        if (data.campaign?.name) parts.push(`Campaign: ${data.campaign.name}`);
        if (data.campaign?.worldContext) parts.push(`World: ${data.campaign.worldContext}`);
        if (data.entities?.length) {
          parts.push(`Known entities: ${data.entities.slice(0, 6).map((e: { name: string }) => e.name).join(', ')}`);
        }
        contextLine = parts.join(' · ');
      }
      updateDraft({
        prompt: (draft.prompt + (draft.prompt ? '\n\n' : '')
          + `[Campaign context for entity prompt]\n${contextLine || '(no campaign context yet)'}\n\nDescribe this entity:`),
      });
    } finally {
      setGeneratingPrompt(false);
    }
  };

  const handleStepChange = async (newStep: number) => {
    await saveStep(draft, newStep);
    setStep(newStep);
  };

  const handleCrystallize = async () => {
    setCrystallizing(true);
    setCrystallizeError(null);
    try {
      await saveStep(draft, step);
      const res = await fetch(`/api/campaigns/${campaignId}/entities/${entityId}/crystallize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seedName: draft.seed?.name ?? null,
          rootForgeItemId: draft.root?.id ?? null,
          branchForgeItemIds: draft.branches.map(b => b.id),
          attributes: draft.attributes,
          skills: draft.skills,
          traits: draft.traits,
          goals: draft.goals,
          targetKV: draft.targetKV,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Crystallize failed' }));
        setCrystallizeError(err.error || 'Crystallize failed');
        return;
      }
      onComplete();
    } catch (e) {
      setCrystallizeError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setCrystallizing(false);
    }
  };

  const handleQuickGenerate = async () => {
    setQuickGenError(null);
    setQuickGenerating(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/entities/quick-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name, prompt: draft.prompt }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Quick-generate failed' }));
        setQuickGenError(err.error || 'Quick-generate failed');
        return;
      }
      const out = await res.json() as {
        seedName: string | null;
        targetKV: number;
        attributes: Record<AttributeName, number>;
        skillHints: Array<{ name: string; level: number; governors: SkillGovernor[]; note?: string }>;
        traitHints: Array<{ name: string; type: 'nectar' | 'thorn'; pillar?: 'body' | 'spirit' | 'soul'; note?: string }>;
        goalHints: Array<{ description: string; priority: number }>;
        notes?: string;
      };

      // Resolve the seed by name (best-effort — null if not in catalog)
      const matchedSeed = out.seedName ? (getSeed(out.seedName) ?? null) : null;

      // Hints become draft skills/traits with NO forgeItemId (since they're
      // AI-suggested names, not bound to campaign forge items yet). The GM
      // will pick real forge items in Steps 5/6 — these hints just pre-fill
      // names and levels so the structure is concrete to start from.
      const mappedSkills: DraftSkill[] = out.skillHints.map(h => ({
        name: h.name,
        level: h.level,
        governors: h.governors,
        description: h.note,
      }));
      const mappedTraits: DraftTrait[] = out.traitHints.map(h => ({
        name: h.name,
        type: h.type,
        pillar: h.pillar,
        description: h.note,
      }));
      const mappedGoals: DraftGoal[] = out.goalHints.map(h => ({
        description: h.description,
        priority: h.priority,
      }));

      const nextDraft: EntityDraft = {
        ...draft,
        targetKV: out.targetKV,
        seed: matchedSeed ?? draft.seed,
        attributes: out.attributes,
        skills: mappedSkills,
        traits: mappedTraits,
        goals: mappedGoals,
      };

      setDraft(nextDraft);
      // Persist immediately so the GM can refresh without losing state
      await saveStep(nextDraft, 1);
      setStep(1);
    } catch (e) {
      setQuickGenError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setQuickGenerating(false);
    }
  };

  const handleNext = () => {
    if (step === STEPS.length - 1) {
      handleCrystallize();
      return;
    }
    // Step 0 + prompt = quick-generate path (fans out into all subsequent steps)
    if (step === 0 && draft.prompt.trim() && draft.name.trim()) {
      handleQuickGenerate();
      return;
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
          <>
            <IntakeStep
              draft={draft}
              onChange={updateDraft}
              campaignId={campaignId}
              onGeneratePrompt={handleGeneratePrompt}
              generatingPrompt={generatingPrompt}
            />
            {quickGenerating && (
              <div className="mt-4 text-center py-3 text-[12px] text-[#3EB89A] font-[family-name:var(--font-terminal)] uppercase tracking-[0.15em] border"
                style={{ borderColor: 'rgba(62,184,154,0.3)', background: 'rgba(62,184,154,0.05)' }}
              >
                Generating draft from prompt (may take 5-10s)...
              </div>
            )}
            {quickGenError && (
              <div className="mt-4 border p-3 text-[12px] font-[family-name:var(--font-terminal)]"
                style={{ borderColor: '#E8585A55', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
              >
                ✗ {quickGenError}
              </div>
            )}
          </>
        )}
        {step === 1 && (
          <SeedStep draft={draft} onChange={updateDraft} />
        )}
        {step === 2 && (
          <>
            <RootStep draft={draft} onChange={updateDraft} campaignId={campaignId} />
            <BranchesPanel draft={draft} onChange={updateDraft} campaignId={campaignId} />
          </>
        )}
        {step === 3 && (
          <AttributesStep draft={draft} onChange={updateDraft} />
        )}
        {step === 4 && (
          <SkillsStep draft={draft} onChange={updateDraft} campaignId={campaignId} />
        )}
        {step === 5 && (
          <TraitsStep draft={draft} onChange={updateDraft} campaignId={campaignId} />
        )}
        {step === 6 && (
          <GoalsStep draft={draft} onChange={updateDraft} />
        )}
        {step === 7 && (
          <ReviewStep
            draft={draft}
            totalKV={totalKV}
            crystallizing={crystallizing}
            error={crystallizeError}
          />
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
            disabled={!canAdvance() || crystallizing || quickGenerating}
            className="px-6 py-2.5 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] font-bold disabled:opacity-30 disabled:cursor-default transition-all hover:brightness-110"
            style={{
              background: canAdvance() && !crystallizing && !quickGenerating
                ? (step === STEPS.length - 1
                    ? 'linear-gradient(135deg, #ffcc78, #d99a36)'
                    : 'linear-gradient(135deg, #3EB89A, #2D9A7E)')
                : 'rgba(62,184,154,0.3)',
              color: '#000',
              boxShadow: canAdvance() && !crystallizing && !quickGenerating
                ? (step === STEPS.length - 1
                    ? '0 0 20px rgba(255,204,120,0.3)'
                    : '0 0 20px rgba(62,184,154,0.25)')
                : 'none',
            }}
          >
            {step === STEPS.length - 1
              ? (crystallizing ? 'Crystallizing...' : 'Crystallize ›')
              : step === 0 && draft.prompt.trim()
                ? (quickGenerating ? 'Generating...' : 'Generate ›')
                : 'Next ›'}
          </button>
        </div>
      </div>
    </div>
  );
}
