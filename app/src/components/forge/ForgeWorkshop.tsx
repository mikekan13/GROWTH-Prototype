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

// ── Generic Detail Renderer ───────────────────────────────────────────────

function BlockDetail({ type, data }: { type: string; data: Record<string, unknown> }) {
  if (type === 'seed') return <SeedDetail data={data} />;

  // Generic fallback for other types
  const description = data.description as string | undefined;
  const governors = data.governors as string[] | undefined;

  return (
    <div className="space-y-2">
      {description && (
        <p className="text-[12px] text-white/60 font-[Consolas,monospace]">{description}</p>
      )}
      {governors && (
        <div className="text-[11px] font-[Consolas,monospace]">
          <span className="text-white/30">GOVERNORS: </span>
          <span className="text-white/60">{governors.join(', ')}</span>
        </div>
      )}
      {/* Show all other data keys */}
      {Object.entries(data).filter(([k]) => !['description', 'governors', 'name'].includes(k)).map(([k, v]) => (
        <div key={k} className="text-[10px] font-[Consolas,monospace]">
          <span className="text-white/30">{k.toUpperCase()}: </span>
          <span className="text-white/50">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}</span>
        </div>
      ))}
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
  const kvLabel = String(data.seedKV || data.karmicValue || blueprint.karmicValue || '');

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 border transition-all hover:border-opacity-60"
      style={{
        backgroundColor: isSelected ? `${typeConfig.color}15` : '#0a0a1a',
        borderColor: isSelected ? typeConfig.color : '#ffffff15',
        borderWidth: '1px',
      }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-bold text-white" style={{ fontFamily: 'var(--font-header), Bebas Neue, sans-serif' }}>
            {blueprint.name}
          </div>
          {typeof data.description === 'string' && (
            <div className="text-[10px] text-white/40 font-[Consolas,monospace] mt-0.5 line-clamp-2">
              {data.description.slice(0, 100)}
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
  const filtered = search
    ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

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
                  {selected.isGlobal && <span className="text-white/30 ml-2">GLOBAL</span>}
                </div>
              </div>

              {/* Description */}
              {typeof selected.data.description === 'string' && (
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
                    style={{ borderColor: '#22ab94', color: '#22ab94' }}
                  >
                    PUBLISH
                  </button>
                )}
                {view === 'campaign' && isGM && (
                  <button
                    onClick={async () => {
                      if (!confirm(`Remove ${selected.name} from this campaign?`)) return;
                      await fetch(`/api/campaigns/${campaignId}/forge/${selected.id}`, { method: 'DELETE' });
                      setSelectedId(null);
                      fetchCampaignItems();
                    }}
                    className="px-3 py-1.5 text-[11px] uppercase font-[Consolas,monospace] text-white/40 border border-white/20 hover:bg-white/5"
                  >
                    REMOVE
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
