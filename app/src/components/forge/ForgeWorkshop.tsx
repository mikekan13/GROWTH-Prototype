"use client";

import React, { useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────

interface Blueprint {
  id: string;
  campaignId: string | null;
  type: string;
  name: string;
  status: string;
  data: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  isGlobal?: boolean;
  authorUserId?: string;
  useCount?: number;
  karmicValue?: number | null;
}

interface ForgeWorkshopProps {
  campaignId: string;
  isGM: boolean;
  userId: string;
}

// ── Block Type Config ─────────────────────────────────────────────────────

const BLOCK_TYPES = [
  { key: 'seed', label: 'Seeds', icon: '🌱', color: '#8e7cc3', desc: 'Species & ancestry' },
  { key: 'root', label: 'Roots', icon: '🌿', color: '#6fa8dc', desc: 'Origin & background' },
  { key: 'branch', label: 'Branches', icon: '🌳', color: '#22ab94', desc: 'Life paths' },
  { key: 'skill', label: 'Skills', icon: '⚔', color: '#ffcc78', desc: 'Abilities & training' },
  { key: 'item', label: 'Items', icon: '🗡', color: '#22ab94', desc: 'Equipment & objects' },
  { key: 'material', label: 'Materials', icon: '⬡', color: '#8B7355', desc: 'Crafting components' },
  { key: 'nectar', label: 'Nectars', icon: '✦', color: '#3EB89A', desc: 'Permanent boons' },
  { key: 'thorn', label: 'Thorns', icon: '✧', color: '#E8585A', desc: 'Permanent penalties' },
  { key: 'blossom', label: 'Blossoms', icon: '❀', color: '#D0A030', desc: 'Temporary buffs' },
] as const;

type BlockType = typeof BLOCK_TYPES[number]['key'];

// ── Seed Detail Renderer ──────────────────────────────────────────────────

function SeedDetail({ data }: { data: Record<string, unknown> }) {
  const attrs = data.attributes as Record<string, number> | undefined;
  const skills = data.skills as Array<{ name: string }> | undefined;
  const nectars = data.nectars as Array<{ name: string }> | undefined;
  const thorns = data.thorns as Array<{ name: string }> | undefined;

  const PILLAR_ATTRS: Array<{ label: string; key: string; color: string }> = [
    { label: 'CLO', key: 'clout', color: '#E8585A' },
    { label: 'CEL', key: 'celerity', color: '#E8585A' },
    { label: 'CON', key: 'constitution', color: '#E8585A' },
    { label: 'FLO', key: 'flow', color: '#8e7cc3' },
    { label: 'FRQ', key: 'frequency', color: '#8e7cc3' },
    { label: 'FOC', key: 'focus', color: '#8e7cc3' },
    { label: 'WIL', key: 'willpower', color: '#4080D0' },
    { label: 'WIS', key: 'wisdom', color: '#4080D0' },
    { label: 'WIT', key: 'wit', color: '#4080D0' },
  ];

  return (
    <div className="space-y-3">
      {/* Key stats row */}
      <div className="flex gap-4 text-[11px] font-[Consolas,monospace]">
        <span style={{ color: '#D0A030' }}>FD: {String(data.baseFateDie || 'd6').toUpperCase()}</span>
        <span style={{ color: '#aaa' }}>AGE: {String(data.fatedAge || '?')}</span>
        <span style={{ color: '#aaa' }}>RESIST: {String(data.baseResist || '?')}</span>
        <span style={{ color: '#D0A030' }}>KV: {String(data.seedKV || '?')}</span>
      </div>

      {/* Attributes grid */}
      {attrs && (
        <div>
          <div className="text-[9px] text-white/30 font-[Consolas,monospace] mb-1">ATTRIBUTES</div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
            {PILLAR_ATTRS.map(a => (
              <div key={a.key} className="flex justify-between text-[11px] font-[Consolas,monospace]">
                <span style={{ color: a.color }}>{a.label}</span>
                <span style={{ color: '#ccc' }}>{attrs[a.key] ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills && skills.length > 0 && (
        <div>
          <div className="text-[9px] text-white/30 font-[Consolas,monospace] mb-0.5">STARTING SKILLS</div>
          <div className="text-[11px] text-white/60 font-[Consolas,monospace]">
            {skills.map(s => s.name).join(', ')}
          </div>
        </div>
      )}

      {/* Nectars / Thorns */}
      <div className="flex gap-4">
        {nectars && nectars.length > 0 && (
          <div>
            <div className="text-[9px] font-[Consolas,monospace] mb-0.5" style={{ color: '#3EB89A' }}>NECTARS</div>
            <div className="text-[10px] text-white/50 font-[Consolas,monospace]">
              {nectars.map(n => n.name).join(', ')}
            </div>
          </div>
        )}
        {thorns && thorns.length > 0 && (
          <div>
            <div className="text-[9px] font-[Consolas,monospace] mb-0.5" style={{ color: '#E8585A' }}>THORNS</div>
            <div className="text-[10px] text-white/50 font-[Consolas,monospace]">
              {thorns.map(t => t.name).join(', ')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Human-first Detail Renderer ───────────────────────────────────────────
//
// Redesign (Mike 2026-08-17): JEWL's genesis drafts carry nested
// mechanicalEffects JSON; the old renderer dumped every key as a raw
// JSON string. Now: the ✎ note leads, prose reads as prose, attribute
// mods and skills render as game language, and anything unrecognized
// collapses into an expandable RAW DATA drawer instead of flooding.

/** Attribute → pillar color, matching the SeedDetail palette. */
const ATTR_META: Record<string, { label: string; color: string }> = {
  clout: { label: 'Clout', color: '#E8585A' },
  celerity: { label: 'Celerity', color: '#E8585A' },
  constitution: { label: 'Constitution', color: '#E8585A' },
  flow: { label: 'Flow', color: '#8e7cc3' },
  frequency: { label: 'Frequency', color: '#8e7cc3' },
  focus: { label: 'Focus', color: '#8e7cc3' },
  willpower: { label: 'Willpower', color: '#4080D0' },
  wisdom: { label: 'Wisdom', color: '#4080D0' },
  wit: { label: 'Wit', color: '#4080D0' },
};

function attrMeta(key: string) {
  return ATTR_META[key.toLowerCase()] ?? { label: titleCase(key), color: '#ccc' };
}

/** "kvPerYear" → "Kv Per Year"; "baseResist" → "Base Resist". */
function titleCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function SectionLabel({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="text-[9px] uppercase tracking-[0.2em] font-[Consolas,monospace] mb-1" style={{ color: color ?? 'rgba(255,255,255,0.3)' }}>
      {children}
    </div>
  );
}

function Chip({ children, color = '#aaa' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 font-[Consolas,monospace] whitespace-nowrap"
      style={{ color, backgroundColor: `${color}12`, border: `1px solid ${color}35` }}
    >
      {children}
    </span>
  );
}

/** {"willpower":2,"wisdom":1} → "+2 Willpower  +1 Wisdom" pillar-colored chips. */
function AttributeMods({ mods }: { mods: Record<string, number> }) {
  const entries = Object.entries(mods).filter(([, v]) => typeof v === 'number' && v !== 0);
  if (entries.length === 0) return null;
  return (
    <div>
      <SectionLabel>Attributes</SectionLabel>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([k, v]) => {
          const meta = attrMeta(k);
          return <Chip key={k} color={meta.color}>{v > 0 ? `+${v}` : v} {meta.label}</Chip>;
        })}
      </div>
    </div>
  );
}

interface SkillGrant {
  name?: string;
  governors?: string[];
  level?: number | string;
  description?: string;
}

/** Skills granted by a root/branch — name, level, governors, then what it means. */
function SkillGrants({ skills }: { skills: SkillGrant[] }) {
  const valid = skills.filter(s => s && typeof s.name === 'string');
  if (valid.length === 0) return null;
  return (
    <div>
      <SectionLabel>Skills Granted</SectionLabel>
      <div className="space-y-2">
        {valid.map((s, i) => (
          <div key={i}>
            <div className="text-[12px] font-[Consolas,monospace] text-white/85">
              {s.name}
              {s.level != null && <span style={{ color: '#D0A030' }}> · level {String(s.level)}</span>}
              {Array.isArray(s.governors) && s.governors.length > 0 && (
                <span className="text-white/35"> · {s.governors.map(g => attrMeta(g).label).join(' / ')}</span>
              )}
            </div>
            {s.description && (
              <div className="text-[11px] text-white/45 font-[Consolas,monospace] leading-relaxed">{s.description}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Nested mechanicalEffects object → recognized sections + leftovers. */
function MechanicalEffects({ effects }: { effects: Record<string, unknown> }) {
  const mods = effects.attributeModifiers as Record<string, number> | undefined;
  const skills = effects.skills as SkillGrant[] | undefined;
  const leftovers = Object.entries(effects).filter(
    ([k, v]) => !['attributeModifiers', 'skills'].includes(k) && v != null,
  );
  return (
    <div className="space-y-3">
      {mods && <AttributeMods mods={mods} />}
      {Array.isArray(skills) && <SkillGrants skills={skills} />}
      {leftovers.map(([k, v]) => (
        <div key={k}>
          <SectionLabel>{titleCase(k)}</SectionLabel>
          <div className="text-[11px] text-white/60 font-[Consolas,monospace] leading-relaxed">
            {typeof v === 'string' ? v : <PrettyValue value={v} />}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Last-resort renderer for unrecognized values — readable, never a JSON wall. */
function PrettyValue({ value }: { value: unknown }) {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return <>{value.join(', ')}</>;
    }
    return (
      <div className="space-y-1">
        {value.map((v, i) => <div key={i}><PrettyValue value={v} /></div>)}
      </div>
    );
  }
  if (typeof value === 'object') {
    return (
      <div className="space-y-0.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <span className="text-white/35">{titleCase(k)}: </span>
            <span className="text-white/60"><PrettyValue value={v} /></span>
          </div>
        ))}
      </div>
    );
  }
  return <>{String(value)}</>;
}

/** Keys the structured sections already display — everything else goes to the drawer. */
const HANDLED_KEYS = new Set([
  'name', 'type', 'description', 'flavorText', '_proposalNote',
  'mechanicalEffects', 'mechanicalEffect', 'governors', 'ageAdded',
  'pillar', 'category', 'itemType', 'primaryMaterial', 'materialClass',
  'weightLbs', 'rarity', 'kv', 'seedKV', 'karmicValue', 'baseResist',
  'properties', 'condition', 'tags',
]);

function BlockDetail({ type, data }: { type: string; data: Record<string, unknown> }) {
  if (type === 'seed') return <SeedDetail data={data} />;

  const proposalNote = data._proposalNote as string | undefined;
  const description = data.description as string | undefined;
  const flavorText = data.flavorText as string | undefined;
  const mechanicalEffects = data.mechanicalEffects as Record<string, unknown> | undefined;
  const mechanicalEffect = data.mechanicalEffect as string | undefined;
  const governors = data.governors as string[] | undefined;

  // Facts row: the at-a-glance chips (age, pillar, item stats...).
  const facts: Array<{ label: string; color?: string }> = [];
  if (data.ageAdded != null) facts.push({ label: `age ${String(data.ageAdded)}+`, color: '#6fa8dc' });
  if (typeof data.pillar === 'string') {
    const p = data.pillar.toLowerCase();
    facts.push({ label: data.pillar, color: p === 'body' ? '#E8585A' : p === 'spirit' ? '#8e7cc3' : p === 'soul' ? '#4080D0' : undefined });
  }
  if (typeof data.category === 'string') facts.push({ label: data.category });
  if (typeof data.itemType === 'string') facts.push({ label: data.itemType, color: '#22ab94' });
  if (typeof data.primaryMaterial === 'string') {
    facts.push({ label: `${data.primaryMaterial}${typeof data.materialClass === 'string' ? ` (${data.materialClass})` : ''}`, color: '#8B7355' });
  }
  if (typeof data.rarity === 'number') facts.push({ label: `rarity ${data.rarity}`, color: '#D0A030' });
  if (typeof data.weightLbs === 'number') facts.push({ label: `${data.weightLbs} lbs` });
  if (typeof data.baseResist === 'number') facts.push({ label: `resist ${data.baseResist}`, color: '#E8585A' });
  if (typeof data.condition === 'string') facts.push({ label: data.condition });

  const properties = Array.isArray(data.properties) ? (data.properties as unknown[]).map(String) : null;
  const leftovers = Object.entries(data).filter(([k, v]) => !HANDLED_KEYS.has(k) && v != null);

  return (
    <div className="space-y-4">
      {/* ✎ Why this exists — JEWL's pitch to the GM, first thing read. */}
      {proposalNote && (
        <div className="p-2.5" style={{ backgroundColor: 'rgba(255,204,120,0.06)', border: '1px solid rgba(255,204,120,0.25)' }}>
          <SectionLabel color="rgba(255,204,120,0.7)">✎ Proposed because</SectionLabel>
          <p className="text-[12px] font-[Consolas,monospace] leading-relaxed" style={{ color: 'rgba(255,204,120,0.85)' }}>
            {proposalNote}
          </p>
        </div>
      )}

      {description && (
        <p className="text-[12px] text-white/70 font-[Consolas,monospace] leading-relaxed">{description}</p>
      )}

      {flavorText && (
        <p className="text-[11px] italic text-white/40 leading-relaxed" style={{ fontFamily: "'Inknut Antiqua', serif" }}>
          “{flavorText}”
        </p>
      )}

      {facts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {facts.map((f, i) => <Chip key={i} color={f.color}>{f.label}</Chip>)}
        </div>
      )}

      {/* The rule, in game language */}
      {mechanicalEffect && (
        <div>
          <SectionLabel color="#22ab94">Rule</SectionLabel>
          <p className="text-[12px] text-white/70 font-[Consolas,monospace] leading-relaxed">{mechanicalEffect}</p>
        </div>
      )}
      {mechanicalEffects && <MechanicalEffects effects={mechanicalEffects} />}

      {Array.isArray(governors) && governors.length > 0 && (
        <div>
          <SectionLabel>Governors</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {governors.map(g => {
              const meta = attrMeta(g);
              return <Chip key={g} color={meta.color}>{meta.label}</Chip>;
            })}
          </div>
        </div>
      )}

      {properties && properties.length > 0 && (
        <div>
          <SectionLabel>Properties</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {properties.map(p => <Chip key={p}>{p}</Chip>)}
          </div>
        </div>
      )}

      {/* Anything unrecognized: tucked away, never a JSON wall */}
      {leftovers.length > 0 && (
        <details className="pt-1">
          <summary className="text-[9px] uppercase tracking-[0.2em] text-white/25 font-[Consolas,monospace] cursor-pointer hover:text-white/40">
            Raw data ({leftovers.length})
          </summary>
          <div className="mt-2 space-y-2 pl-2 border-l border-white/10">
            {leftovers.map(([k, v]) => (
              <div key={k} className="text-[10px] font-[Consolas,monospace]">
                <span className="text-white/35">{titleCase(k)}: </span>
                <span className="text-white/55"><PrettyValue value={v} /></span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Blueprint Card ────────────────────────────────────────────────────────

function BlueprintCard({
  blueprint,
  typeConfig,
  isSelected,
  onClick,
}: {
  blueprint: Blueprint;
  typeConfig: typeof BLOCK_TYPES[number];
  isSelected: boolean;
  onClick: () => void;
}) {
  const data = blueprint.data;
  const kvLabel = String(data.seedKV || data.karmicValue || data.kv || blueprint.karmicValue || '');
  const isDraft = blueprint.status === 'draft';
  const proposalNote = typeof data._proposalNote === 'string' ? data._proposalNote : null;
  // Drafts are triaged by the proposer's ✎ note; published entries by description.
  const preview = isDraft && proposalNote ? `✎ ${proposalNote}` : (typeof data.description === 'string' ? data.description : null);

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 border transition-all hover:border-opacity-60"
      style={{
        backgroundColor: isSelected ? `${typeConfig.color}15` : '#0a0a1a',
        borderColor: isSelected ? typeConfig.color : isDraft ? 'rgba(255,204,120,0.3)' : '#ffffff15',
        borderWidth: '1px',
        borderLeftWidth: isDraft ? '3px' : '1px',
        borderLeftColor: isDraft ? '#ffcc78' : undefined,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold text-white" style={{ fontFamily: 'var(--font-header), Bebas Neue, sans-serif' }}>
              {blueprint.name}
            </div>
            {isDraft && (
              <span className="text-[8px] px-1 py-px uppercase tracking-[0.15em] font-[Consolas,monospace] shrink-0" style={{
                color: '#ffcc78', backgroundColor: 'rgba(255,204,120,0.1)', border: '1px solid rgba(255,204,120,0.35)',
              }}>
                {proposalNote ? 'draft · JEWL' : 'draft'}
              </span>
            )}
          </div>
          {preview && (
            <div
              className="text-[10px] font-[Consolas,monospace] mt-0.5 line-clamp-2"
              style={{ color: isDraft && proposalNote ? 'rgba(255,204,120,0.55)' : 'rgba(255,255,255,0.4)' }}
            >
              {preview.slice(0, 140)}
            </div>
          )}
        </div>
        {kvLabel && (
          <span className="text-[10px] px-1.5 py-0.5 font-[Consolas,monospace] shrink-0" style={{
            color: '#D0A030',
            backgroundColor: '#D0A03015',
            border: '1px solid #D0A03030',
          }}>
            KV {String(kvLabel)}
          </span>
        )}
      </div>
      {blueprint.isGlobal && blueprint.useCount != null && (
        <div className="text-[9px] text-white/20 font-[Consolas,monospace] mt-1">
          {blueprint.useCount} campaigns
        </div>
      )}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

export default function ForgeWorkshop({ campaignId, isGM, userId }: ForgeWorkshopProps) {
  const [activeType, setActiveType] = useState<BlockType>('seed');
  const [view, setView] = useState<'campaign' | 'global'>('campaign');
  const [campaignItems, setCampaignItems] = useState<Blueprint[]>([]);
  const [globalItems, setGlobalItems] = useState<Blueprint[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const typeConfig = BLOCK_TYPES.find(t => t.key === activeType)!;

  // ── Fetch campaign items ────────────────────────────────────────────────

  const fetchCampaignItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/forge?type=${activeType}`);
      if (res.ok) {
        const data = await res.json();
        setCampaignItems(data.items || []);
      }
    } catch { /* silent */ }
  }, [campaignId, activeType]);

  // ── Fetch global catalog ────────────────────────────────────────────────

  const fetchGlobalItems = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/campaigns/${campaignId}/forge?type=${activeType}&global=true`);
      if (res.ok) {
        const data = await res.json();
        setGlobalItems(data.items || []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [campaignId, activeType]);

  useEffect(() => {
    fetchCampaignItems();
    if (view === 'global') fetchGlobalItems();
  }, [activeType, view, fetchCampaignItems, fetchGlobalItems]);

  // ── Pull from global ────────────────────────────────────────────────────

  const handlePull = async (globalItemId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/forge/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalItemId }),
      });
      if (res.ok) {
        fetchCampaignItems();
        setView('campaign');
      }
    } catch { /* silent */ }
  };

  // ── Create new blueprint ────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createName.trim() || !createDesc.trim()) return;
    setCreating(true);
    try {
      // Submit to the authoring chain — every blueprint must be graded
      // by Selva → Creator → Kai → Et'herling. Direct creation is disabled.
      const authorRes = await fetch(`/api/campaigns/${campaignId}/forge/author`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: activeType,
          name: createName.trim(),
          description: createDesc.trim(),
        }),
      });
      if (!authorRes.ok) {
        const err = await authorRes.json();
        alert(err.error || 'Forge chain failed.');
        return;
      }
      const { result } = await authorRes.json();

      // Confirm — persist as draft for GM to publish later from the workshop list.
      const confirmRes = await fetch(`/api/campaigns/${campaignId}/forge/author`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: result.type,
          name: result.canonicalName,
          data: result.data,
          karmicValue: result.suggestedKV,
        }),
      });
      if (confirmRes.ok) {
        setCreateName('');
        setCreateDesc('');
        setShowCreate(false);
        fetchCampaignItems();
      } else {
        const err = await confirmRes.json();
        alert(err.error || 'Failed to persist forged blueprint.');
      }
    } catch { alert('Connection failed.'); }
    finally { setCreating(false); }
  };

  // ── Filter items ────────────────────────────────────────────────────────

  const items = view === 'campaign' ? campaignItems : globalItems;
  const searched = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;
  // Drafts float to the top — they're the ones waiting on the GM.
  const filtered = [...searched].sort((a, b) =>
    (a.status === 'draft' ? 0 : 1) - (b.status === 'draft' ? 0 : 1));

  const selected = filtered.find(i => i.id === selectedId);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#0a0a1a' }}>
      {/* Type tabs */}
      <div className="flex-shrink-0 flex overflow-x-auto border-b" style={{ borderColor: '#ffffff10' }}>
        {BLOCK_TYPES.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveType(t.key); setSelectedId(null); setSearch(''); }}
            className="px-3 py-2 text-[10px] uppercase tracking-[0.15em] font-[Consolas,monospace] whitespace-nowrap transition-colors border-b-2"
            style={{
              color: activeType === t.key ? t.color : '#ffffff40',
              borderBottomColor: activeType === t.key ? t.color : 'transparent',
              backgroundColor: activeType === t.key ? `${t.color}08` : 'transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Toolbar: view toggle + search + create */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: '#ffffff10' }}>
        {/* Campaign / Global toggle */}
        <div className="flex border" style={{ borderColor: '#ffffff20' }}>
          <button
            onClick={() => setView('campaign')}
            className="px-2 py-0.5 text-[10px] uppercase font-[Consolas,monospace] transition-colors"
            style={{
              backgroundColor: view === 'campaign' ? typeConfig.color : 'transparent',
              color: view === 'campaign' ? '#000' : '#ffffff50',
            }}
          >
            Campaign
          </button>
          <button
            onClick={() => setView('global')}
            className="px-2 py-0.5 text-[10px] uppercase font-[Consolas,monospace] transition-colors"
            style={{
              backgroundColor: view === 'global' ? typeConfig.color : 'transparent',
              color: view === 'global' ? '#000' : '#ffffff50',
            }}
          >
            Global
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Search ${typeConfig.label.toLowerCase()}...`}
          className="flex-1 text-[11px] px-2 py-1 bg-transparent border font-[Consolas,monospace] text-white/70 placeholder:text-white/20 outline-none focus:border-white/30"
          style={{ borderColor: '#ffffff15' }}
        />

        {/* Create button (GM only) */}
        {isGM && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-2 py-0.5 text-[10px] uppercase font-[Consolas,monospace] border transition-colors hover:bg-white/5"
            style={{ borderColor: typeConfig.color, color: typeConfig.color }}
          >
            + CREATE
          </button>
        )}
      </div>

      {/* Create form (collapsible) */}
      {showCreate && isGM && (
        <div className="flex-shrink-0 px-3 py-3 border-b space-y-2" style={{ borderColor: '#ffffff10', backgroundColor: `${typeConfig.color}08` }}>
          <input
            type="text"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            placeholder={`${typeConfig.label.slice(0, -1)} name...`}
            className="w-full text-sm px-2 py-1 bg-black/40 border text-white font-[Consolas,monospace] outline-none"
            style={{ borderColor: `${typeConfig.color}40` }}
          />
          <textarea
            value={createDesc}
            onChange={e => setCreateDesc(e.target.value)}
            placeholder="Describe what you want to create. The Godhead will balance and finalize it..."
            rows={3}
            className="w-full text-[11px] px-2 py-1 bg-black/40 border text-white/70 font-[Consolas,monospace] outline-none resize-none"
            style={{ borderColor: `${typeConfig.color}40` }}
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1 text-[10px] uppercase font-[Consolas,monospace] text-white/40 hover:text-white/60"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !createName.trim()}
              className="px-3 py-1 text-[10px] uppercase font-[Consolas,monospace] border transition-colors"
              style={{
                borderColor: typeConfig.color,
                color: '#000',
                backgroundColor: creating ? `${typeConfig.color}60` : typeConfig.color,
              }}
            >
              {creating ? 'FORGING...' : 'FORGE'}
            </button>
          </div>
        </div>
      )}

      {/* Main content: list + detail split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Blueprint list */}
        <div className="w-1/2 overflow-y-auto border-r" style={{ borderColor: '#ffffff10' }}>
          {loading && (
            <div className="text-center text-[11px] text-white/30 font-[Consolas,monospace] py-8">
              Loading {view} catalog...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-[11px] text-white/30 font-[Consolas,monospace] py-8">
              {view === 'campaign'
                ? `No ${typeConfig.label.toLowerCase()} in this campaign. Pull from Global or create one.`
                : `No ${typeConfig.label.toLowerCase()} found.`}
            </div>
          )}
          <div className="space-y-0">
            {filtered.map(bp => (
              <BlueprintCard
                key={bp.id}
                blueprint={bp}
                typeConfig={typeConfig}
                isSelected={bp.id === selectedId}
                onClick={() => setSelectedId(bp.id === selectedId ? null : bp.id)}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="w-1/2 overflow-y-auto p-4">
          {selected ? (
            <div className="space-y-4">
              {/* Header */}
              <div>
                <div className="text-lg font-bold text-white" style={{ fontFamily: 'var(--font-header), Bebas Neue, sans-serif' }}>
                  {selected.name}
                </div>
                <div className="text-[10px] font-[Consolas,monospace] mt-0.5" style={{ color: typeConfig.color }}>
                  {typeConfig.label.slice(0, -1).toUpperCase()}
                  {selected.status === 'draft' && <span className="ml-2" style={{ color: '#ffcc78' }}>DRAFT — AWAITING YOUR CALL</span>}
                  {selected.isGlobal && <span className="text-white/30 ml-2">GLOBAL</span>}
                </div>
              </div>

              {/* Description — seeds only; BlockDetail renders it for the rest */}
              {activeType === 'seed' && typeof selected.data.description === 'string' && (
                <p className="text-[12px] text-white/60 font-[Consolas,monospace] leading-relaxed">
                  {selected.data.description}
                </p>
              )}

              {/* Type-specific detail */}
              <BlockDetail type={activeType} data={selected.data} />

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t" style={{ borderColor: '#ffffff10' }}>
                {view === 'global' && isGM && (
                  <button
                    onClick={() => handlePull(selected.id)}
                    className="px-3 py-1.5 text-[11px] uppercase font-[Consolas,monospace] border transition-colors hover:opacity-80"
                    style={{ borderColor: typeConfig.color, color: '#000', backgroundColor: typeConfig.color }}
                  >
                    PULL TO CAMPAIGN
                  </button>
                )}
                {view === 'campaign' && isGM && selected.status === 'draft' && (
                  <button
                    onClick={async () => {
                      await fetch(`/api/campaigns/${campaignId}/forge/${selected.id}/publish`, { method: 'POST' });
                      fetchCampaignItems();
                    }}
                    className="px-3 py-1.5 text-[11px] uppercase font-[Consolas,monospace] border transition-colors"
                    style={{ borderColor: 'var(--terminal-prime)', color: 'var(--terminal-prime)' }}
                  >
                    ✓ APPROVE & PUBLISH
                  </button>
                )}
                {view === 'campaign' && isGM && (
                  <button
                    onClick={async () => {
                      const verb = selected.status === 'draft' ? 'Deny' : 'Remove';
                      if (!confirm(`${verb} ${selected.name}?`)) return;
                      await fetch(`/api/campaigns/${campaignId}/forge/${selected.id}`, { method: 'DELETE' });
                      setSelectedId(null);
                      fetchCampaignItems();
                    }}
                    className="px-3 py-1.5 text-[11px] uppercase font-[Consolas,monospace] border hover:bg-white/5"
                    style={selected.status === 'draft'
                      ? { borderColor: 'rgba(231,76,60,0.5)', color: 'rgba(231,76,60,0.85)' }
                      : { borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.4)' }}
                  >
                    {selected.status === 'draft' ? '✗ DENY' : 'REMOVE'}
                  </button>
                )}
              </div>

              {/* Meta info */}
              {selected.isGlobal && (
                <div className="text-[9px] text-white/20 font-[Consolas,monospace] space-y-0.5">
                  {selected.useCount != null && <div>Used in {selected.useCount} campaigns</div>}
                  <div>Created {new Date(selected.createdAt).toLocaleDateString()}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl mb-2">{typeConfig.icon}</div>
                <div className="text-[11px] text-white/30 font-[Consolas,monospace]">
                  Select a {typeConfig.label.slice(0, -1).toLowerCase()} to view details
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
