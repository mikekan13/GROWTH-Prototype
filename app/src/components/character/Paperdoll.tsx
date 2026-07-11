'use client';

/**
 * Paperdoll.tsx (T26) — 3-tier live inventory UI.
 *
 * Tier A: Equipped — region tree (derived, never hardcoded) with item chips
 * Tier B: Carried  — items not yet equipped; inline region picker per item
 * Tier C: Possessions — read-only ownership links
 *
 * Types are declared locally to avoid pulling server-only service modules
 * into the client bundle. The shapes mirror @/services/inventory exactly.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Local type mirrors ─────────────────────────────────────────────────────

interface BodyRegion {
  key: string;
  partName: string;
  depth: number;
  condition: number;
  baseResist: number;
}

interface InventoryItemView {
  id: string;
  name: string;
  type: string;
  status: string;
  weightLbs: number;
  equippedTo: string | null;
  data: { condition?: number; armorCategory?: string; [k: string]: unknown };
}

type EncumbranceStatus = 'Fine' | 'Near Limit' | 'Encumbered' | 'Overloaded';

interface EncumbranceView {
  totalLbs: number;
  capacityLbs: number;
  status: EncumbranceStatus;
}

interface PossessionRow {
  id: string;
  targetId: string;
  targetType: string;
  targetName: string;
  targetSubtype: string | null;
  krmaValue: number;
  note: string | null;
}

interface InventoryData {
  regions: BodyRegion[];
  equipped: InventoryItemView[];
  carried: InventoryItemView[];
  possessions: PossessionRow[];
  encumbrance: EncumbranceView;
}

// ── Constants ──────────────────────────────────────────────────────────────

const ENC_COLORS: Record<EncumbranceStatus, string> = {
  Fine:          '#22ab94',
  'Near Limit':  '#ffcc78',
  Encumbered:    '#D07818',
  Overloaded:    '#f7525f',
};

const COND_COLOR: Record<number, string> = {
  3: '#22ab94',
  2: '#ffcc78',
  1: '#D07818',
  0: '#f7525f',
};

const COND_LABEL: Record<number, string> = {
  3: 'Fine',
  2: 'Damaged',
  1: 'Critical',
  0: 'Destroyed',
};

function condColor(c: number | undefined): string { return COND_COLOR[c ?? 3] ?? '#808080'; }
function condLabel(c: number | undefined): string { return COND_LABEL[c ?? 3] ?? '—'; }
function fmtLbs(n: number): string { return Number.isInteger(n) ? String(n) : n.toFixed(1); }

// ── Component ──────────────────────────────────────────────────────────────

interface PaperdollProps {
  characterId: string;
  canEdit: boolean;
}

export default function Paperdoll({ characterId, canEdit }: PaperdollProps) {
  const [inv, setInv]             = useState<InventoryData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadErr, setLoadErr]     = useState<string | null>(null);
  const [openMenu, setOpenMenu]   = useState<string | null>(null);   // itemId whose region picker is open
  const [equipErrs, setEquipErrs] = useState<Record<string, string>>({}); // itemId → error msg
  const [dragOver, setDragOver]   = useState<string | null>(null);   // regionKey hovered during drag
  const dragRef                   = useRef<{ itemId: string } | null>(null);

  // ── Data fetch ──
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/characters/${characterId}/inventory`);
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { inventory: InventoryData };
      setInv(json.inventory);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => { void load(); }, [load]);

  // ── Mutations ──
  const unequip = useCallback(async (itemId: string) => {
    const res = await fetch(`/api/characters/${characterId}/inventory/equip`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId }),
    });
    if (res.ok) { await load(); }
  }, [characterId, load]);

  const equip = useCallback(async (itemId: string, partKey: string) => {
    const res = await fetch(`/api/characters/${characterId}/inventory/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, partKey }),
    });
    if (res.ok) {
      setEquipErrs(prev => { const n = { ...prev }; delete n[itemId]; return n; });
      setOpenMenu(null);
      await load();
    } else {
      const json = (await res.json()) as { error?: string };
      setEquipErrs(prev => ({ ...prev, [itemId]: json.error ?? 'Equip failed' }));
    }
  }, [characterId, load]);

  // ── HTML5 drag-and-drop ──
  const onDragStart = useCallback((itemId: string) => { dragRef.current = { itemId }; }, []);

  const onDropRegion = useCallback(async (regionKey: string) => {
    const payload = dragRef.current;
    dragRef.current = null;
    setDragOver(null);
    if (!payload) return;
    await equip(payload.itemId, regionKey);
  }, [equip]);

  const onDropCarried = useCallback(async () => {
    const payload = dragRef.current;
    dragRef.current = null;
    setDragOver(null);
    if (!payload) return;
    await unequip(payload.itemId);
  }, [unequip]);

  // ── Loading / error states ──
  if (loading) {
    return (
      <div>
        <div className="section-badge inline-block text-sm mb-3">Inventory</div>
        <div className="text-xs text-[var(--surface-dark)]/40 italic">Loading…</div>
      </div>
    );
  }

  if (loadErr || !inv) {
    return (
      <div>
        <div className="section-badge inline-block text-sm mb-3">Inventory</div>
        <div className="text-xs" style={{ color: '#f7525f' }}>{loadErr ?? 'No data.'}</div>
      </div>
    );
  }

  const { regions, equipped, carried, possessions, encumbrance: enc } = inv;

  // Map equipped items by regionKey for O(1) lookup in the render loop
  const byRegion: Record<string, InventoryItemView[]> = {};
  for (const item of equipped) {
    const k = item.equippedTo!;
    (byRegion[k] ??= []).push(item);
  }

  const encColor = ENC_COLORS[enc.status];
  const fillPct  = enc.capacityLbs > 0
    ? Math.min(100, (enc.totalLbs / enc.capacityLbs) * 100)
    : enc.totalLbs > 0 ? 100 : 0;

  return (
    <div>
      <div className="section-badge inline-block text-sm mb-4">Inventory</div>

      {/* ── ENCUMBRANCE BAR ─────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs mb-1">
          <span style={{ color: encColor }}>
            {fmtLbs(enc.totalLbs)} / {enc.capacityLbs} lbs
          </span>
          <span
            className="uppercase tracking-wider text-[10px]"
            style={{ color: encColor }}
          >
            {enc.status}
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-[var(--surface-dark)]/10">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${fillPct}%`, backgroundColor: encColor }}
          />
        </div>
      </div>

      {/* ── TIER A: EQUIPPED ────────────────────────────────────────── */}
      <div className="mb-5">
        <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--surface-dark)]/40 mb-2">
          Equipped
        </div>

        {regions.length === 0 ? (
          <div className="text-xs text-[var(--surface-dark)]/40 italic">No body regions.</div>
        ) : (
          <div className="space-y-0.5">
            {regions.map(region => {
              const destroyed = region.condition === 0;
              const items     = byRegion[region.key] ?? [];
              const isTarget  = dragOver === region.key;

              return (
                <div
                  key={region.key}
                  style={{ paddingLeft: region.depth * 12 }}
                  onDragOver={canEdit ? e => { e.preventDefault(); setDragOver(region.key); } : undefined}
                  onDragLeave={canEdit ? () => setDragOver(null) : undefined}
                  onDrop={canEdit ? e => { e.preventDefault(); void onDropRegion(region.key); } : undefined}
                  className={isTarget
                    ? 'rounded outline outline-1 outline-dashed outline-[#22ab94] bg-[#22ab94]/5'
                    : 'rounded'
                  }
                >
                  {/* Region header row */}
                  <div
                    className="flex items-center gap-2 py-0.5"
                    style={{ opacity: destroyed ? 0.5 : 1 }}
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: condColor(region.condition) }}
                      title={condLabel(region.condition)}
                    />
                    <span
                      className="text-xs font-medium text-[var(--surface-dark)]"
                      style={{ textDecoration: destroyed ? 'line-through' : undefined }}
                    >
                      {region.partName}
                    </span>
                    <span className="text-[10px] text-[var(--surface-dark)]/30">
                      {condLabel(region.condition)}
                    </span>
                    {region.baseResist > 0 && (
                      <span className="text-[10px]" style={{ color: '#6fa8dc' }}>
                        R{region.baseResist}
                      </span>
                    )}
                  </div>

                  {/* Item chips equipped to this region */}
                  {items.length > 0 && (
                    <div className="flex flex-wrap gap-1 pb-1 pl-4">
                      {items.map(item => {
                        const ic  = item.data.condition;
                        const iid = ic === 0;
                        return (
                          <div
                            key={item.id}
                            draggable={canEdit}
                            onDragStart={canEdit ? () => onDragStart(item.id) : undefined}
                            className="flex items-center gap-1 px-2 py-0.5 text-xs border border-[var(--surface-dark)]/10 rounded-sm"
                            style={{
                              opacity: iid ? 0.5 : 1,
                              textDecoration: iid ? 'line-through' : undefined,
                              cursor: canEdit ? 'grab' : 'default',
                            }}
                          >
                            <span className="text-[8px]" style={{ color: condColor(ic) }}>&#x25cf;</span>
                            <span>{item.name}</span>
                            <span className="text-[var(--surface-dark)]/40">{fmtLbs(item.weightLbs)}lb</span>
                            {canEdit && (
                              <button
                                onClick={() => void unequip(item.id)}
                                title={`Unequip ${item.name}`}
                                aria-label={`Unequip ${item.name}`}
                                className="ml-1 text-[var(--surface-dark)]/30 hover:text-[#f7525f] text-[11px] leading-none transition-colors"
                              >
                                &#x2297;
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── TIER B: CARRIED ─────────────────────────────────────────── */}
      <div
        className="mb-5"
        onDragOver={canEdit ? e => e.preventDefault() : undefined}
        onDrop={canEdit ? e => { e.preventDefault(); void onDropCarried(); } : undefined}
      >
        <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--surface-dark)]/40 mb-2">
          Carried
        </div>

        {carried.length === 0 ? (
          <div className="text-xs text-[var(--surface-dark)]/40 italic">Nothing carried.</div>
        ) : (
          <div>
            {carried.map(item => {
              const ic        = item.data.condition;
              const destroyed = ic === 0;
              const menuOpen  = openMenu === item.id;
              const equipErr  = equipErrs[item.id];

              return (
                <div key={item.id}>
                  <div
                    className="flex items-center justify-between py-1 border-b border-[var(--surface-dark)]/5"
                    style={{ opacity: destroyed ? 0.5 : 1 }}
                    draggable={canEdit}
                    onDragStart={canEdit ? () => onDragStart(item.id) : undefined}
                  >
                    {/* Left: condition dot + name + type */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 text-sm">
                      <span
                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: condColor(ic) }}
                        title={condLabel(ic)}
                      />
                      <span
                        className="truncate"
                        style={{ textDecoration: destroyed ? 'line-through' : undefined }}
                      >
                        {item.name}
                      </span>
                      <span className="text-xs text-[var(--surface-dark)]/40 flex-shrink-0 capitalize">
                        {item.type}
                      </span>
                    </div>

                    {/* Right: weight + condition label + equip button */}
                    <div className="flex items-center gap-3 text-xs text-[var(--surface-dark)]/40 flex-shrink-0">
                      <span>{fmtLbs(item.weightLbs)} lbs</span>
                      <span style={{ color: condColor(ic) }}>{condLabel(ic)}</span>
                      {canEdit && (
                        <button
                          onClick={() => setOpenMenu(menuOpen ? null : item.id)}
                          className="text-[var(--accent-teal)] hover:underline text-xs"
                        >
                          Equip &#x25be;
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline region picker */}
                  {menuOpen && canEdit && (
                    <div className="ml-4 mt-1 mb-2 border border-[var(--surface-dark)]/10 rounded-sm bg-white/70 p-1 shadow-sm max-h-48 overflow-y-auto">
                      {regions.length === 0 ? (
                        <div className="text-xs text-[var(--surface-dark)]/40 p-1">No regions available.</div>
                      ) : regions.map(region => (
                        <button
                          key={region.key}
                          disabled={region.condition === 0}
                          onClick={() => void equip(item.id, region.key)}
                          className="block w-full text-left text-xs py-1 hover:bg-[#22ab94]/10 disabled:opacity-40 disabled:cursor-not-allowed rounded-sm"
                          style={{ paddingLeft: `${8 + region.depth * 12}px` }}
                        >
                          {region.partName}
                          {region.condition === 0 && (
                            <span className="ml-1 text-[10px]" style={{ color: '#f7525f' }}>
                              (destroyed)
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Inline equip error (e.g. layer cap violation) */}
                  {equipErr && (
                    <div className="ml-4 text-xs mt-0.5 mb-1" style={{ color: '#f7525f' }}>
                      {equipErr}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── TIER C: POSSESSIONS ─────────────────────────────────────── */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--surface-dark)]/40 mb-2">
          Possessions
        </div>

        {possessions.length === 0 ? (
          <div className="text-xs text-[var(--surface-dark)]/40 italic">No possessions.</div>
        ) : (
          <div>
            {possessions.map(p => (
              <div
                key={p.id}
                className="flex items-center justify-between py-1 border-b border-[var(--surface-dark)]/5 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{p.targetName}</span>
                  {p.targetSubtype && (
                    <span className="text-[var(--surface-dark)]/40 flex-shrink-0">{p.targetSubtype}</span>
                  )}
                  <span className="text-[var(--surface-dark)]/30 flex-shrink-0 capitalize">
                    {p.targetType}
                  </span>
                </div>
                {p.krmaValue > 0 && (
                  <span className="flex-shrink-0" style={{ color: '#a07a30' }}>
                    {p.krmaValue}&#x049c;V
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
