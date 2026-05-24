"use client";

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { HeldItemData } from '@/types/item';
import { ITEM_TYPE_ICONS, formatDamage, getConditionLabel, getConditionColor, getRarityColor, getRarityLabel } from '@/types/item';
import { getItemWeightLbs, getCarryCapacityLbs } from '@/types/material';

// ── Props ────────────────────────────────────────────────────────────────────

interface InventoryCardProps {
  characterId: string;
  characterName: string;
  carryLevel: number;        // Clout attribute (used to derive lbs capacity)
  items: HeldItemData[];
  isDropTarget?: boolean;
  isGM?: boolean;
  onRemoveItem?: (itemId: string) => void;
  onToggleEquip?: (itemId: string, equipped: boolean) => void;
  onClose?: () => void;
  /** Fired when the user drags a row and releases somewhere on the page. */
  onDragEnd?: (itemId: string, clientX: number, clientY: number) => void;
  /** Fired continuously while dragging — lets parent compute drop-target highlight. */
  onDragHover?: (clientX: number, clientY: number) => void;
  /** Fired when drag starts / ends, so parent can clear hover state. */
  onDragChange?: (active: boolean) => void;
}

// ── Weight Status ────────────────────────────────────────────────────────────

type WeightStatus = 'Fine' | 'Near Limit' | 'Encumbered' | 'Overloaded';

function getWeightStatus(totalLbs: number, capacityLbs: number): WeightStatus {
  if (capacityLbs <= 0) return totalLbs > 0 ? 'Overloaded' : 'Fine';
  const ratio = totalLbs / capacityLbs;
  if (ratio <= 0.85) return 'Fine';
  if (ratio <= 1.0) return 'Near Limit';
  if (ratio <= 1.25) return 'Encumbered';
  return 'Overloaded';
}

function getWeightStatusColor(status: WeightStatus): string {
  switch (status) {
    case 'Fine': return '#4ade80';
    case 'Near Limit': return '#ffcc78';
    case 'Encumbered': return '#f59e0b';
    case 'Overloaded': return '#E8585A';
  }
}

function formatLbs(lbs: number): string {
  if (Number.isInteger(lbs)) return `${lbs}`;
  return lbs.toFixed(1);
}

// ── Filter Types ─────────────────────────────────────────────────────────────

const FILTER_TYPES = ['all', 'equipped', 'weapon', 'armor', 'tool', 'consumable', 'misc'] as const;
type FilterType = typeof FILTER_TYPES[number];

function matchesFilter(item: HeldItemData, filter: FilterType): boolean {
  if (filter === 'all') return true;
  if (filter === 'equipped') return item.data.equipped === true;
  if (filter === 'misc') return !['weapon', 'armor', 'tool', 'consumable'].includes(item.type);
  return item.type === filter;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function InventoryCard({
  characterId,
  carryLevel,
  items,
  isDropTarget,
  isGM,
  onRemoveItem,
  onToggleEquip,
  onClose,
  onDragEnd,
  onDragHover,
  onDragChange,
}: InventoryCardProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  const safeItems = Array.isArray(items) ? items : [];

  const totalLbs = safeItems.reduce((sum, item) => sum + getItemWeightLbs(item.data), 0);
  const capacityLbs = getCarryCapacityLbs(carryLevel);
  const equippedCount = safeItems.filter(i => i.data.equipped).length;
  const totalValue = safeItems.reduce((sum, item) => sum + (item.data.value ?? 0), 0);
  const weightStatus = getWeightStatus(totalLbs, capacityLbs);

  const filteredItems = safeItems.filter(item => matchesFilter(item, filter));

  return (
    <div
      data-character-id={characterId}
      data-drop-zone="inventory"
      className="border transition-all duration-200"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a2e',
        borderColor: '#ffcc78',
        borderRadius: '3px',
        borderWidth: isDropTarget ? '3px' : '1px',
        boxShadow: isDropTarget ? '0 0 24px rgba(255, 204, 120, 0.7), inset 0 0 12px rgba(255, 204, 120, 0.25)' : 'none',
      }}
    >
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'🎒'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>INVENTORY</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {safeItems.length} items {'•'} {formatLbs(totalLbs)}/{capacityLbs} lbs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              onMouseDown={e => e.stopPropagation()}
              className="p-1 hover:bg-white/20 transition-colors"
              style={{ borderRadius: '2px' }}
              title={isExpanded ? "Collapse" : "Expand"}
            >
              <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {onClose && (
              <button
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                onMouseDown={e => e.stopPropagation()}
                className="p-1 hover:bg-white/20 transition-colors"
                style={{ borderRadius: '2px' }}
                title="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Drop target indicator */}
      {isDropTarget && (
        <div style={{
          padding: '6px',
          background: 'rgba(255, 204, 120, 0.12)',
          borderBottom: '1px solid rgba(255, 204, 120, 0.3)',
          textAlign: 'center',
          fontSize: '10px',
          color: '#ffcc78',
          fontFamily: 'var(--font-terminal), Consolas, monospace',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          Drop item to add to inventory
        </div>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {FILTER_TYPES.map((filterType) => (
              <button
                key={filterType}
                onClick={(e) => { e.stopPropagation(); setFilter(filterType); }}
                onMouseDown={e => e.stopPropagation()}
                className="px-2 py-1 text-xs transition-colors uppercase"
                style={{
                  borderRadius: '2px',
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                  letterSpacing: '0.05em',
                  fontSize: '11px',
                  backgroundColor: filter === filterType ? '#582a72' : '#2a2a3e',
                  color: filter === filterType ? '#ffcc78' : '#888',
                  border: `1px solid ${filter === filterType ? '#ffcc78' : '#3a3a4e'}`,
                }}
              >
                {filterType}
              </button>
            ))}
          </div>

          {/* Quick Stats — Weight, Equipped, Value */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="p-2 text-center" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', border: '1px solid #3a3a4e' }}>
              <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>CARRY (LBS)</div>
              <div className="text-sm font-bold" style={{ color: getWeightStatusColor(weightStatus) }}>
                {formatLbs(totalLbs)}/{capacityLbs}
              </div>
              <div className="text-xs" style={{ color: getWeightStatusColor(weightStatus), fontSize: '8px' }}>
                {weightStatus}
              </div>
            </div>
            <div className="p-2 text-center" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', border: '1px solid #3a3a4e' }}>
              <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>EQUIPPED</div>
              <div className="text-sm font-bold text-green-400">{equippedCount}</div>
            </div>
            <div className="p-2 text-center" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', border: '1px solid #3a3a4e' }}>
              <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>VALUE</div>
              <div className="text-sm font-bold" style={{ color: '#ffcc78' }}>{totalValue} &#x049C;V</div>
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-1 max-h-72 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3a3a4e #1a1a2e' }}>
            {filteredItems.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                {safeItems.length === 0 ? 'No items — drag items here' : 'No items match filter'}
              </div>
            ) : (
              filteredItems.map((item) => (
                <InventoryItemRow
                  key={item.id}
                  item={item}
                  isGM={isGM}
                  onRemove={onRemoveItem}
                  onToggleEquip={onToggleEquip}
                  onDragEnd={onDragEnd}
                  onDragHover={onDragHover}
                  onDragChange={onDragChange}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Individual Item Row ──────────────────────────────────────────────────────

const DRAG_THRESHOLD_PX = 5;

function InventoryItemRow({
  item,
  isGM: _isGM,
  onRemove: _onRemove,
  onToggleEquip,
  onDragEnd,
  onDragHover,
  onDragChange,
}: {
  item: HeldItemData;
  isGM?: boolean;
  onRemove?: (itemId: string) => void;
  onToggleEquip?: (itemId: string, equipped: boolean) => void;
  onDragEnd?: (itemId: string, clientX: number, clientY: number) => void;
  onDragHover?: (clientX: number, clientY: number) => void;
  onDragChange?: (active: boolean) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [popupPos, setPopupPos] = useState<{ left: number; top: number } | null>(null);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDetails || !dragRef.current) {
      setPopupPos(null);
      return;
    }
    const rect = dragRef.current.getBoundingClientRect();
    const popupWidth = 320;
    const margin = 8;
    let left = rect.right + margin;
    if (left + popupWidth > window.innerWidth) left = Math.max(margin, rect.left - popupWidth - margin);
    const top = Math.min(rect.top, window.innerHeight - 60);
    setPopupPos({ left, top });
  }, [showDetails]);

  useEffect(() => {
    if (!showDetails) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dragRef.current?.contains(target)) return;
      setShowDetails(false);
    };
    const t = setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDocClick, true); };
  }, [showDetails]);

  const data = item.data;
  const typeIcon = ITEM_TYPE_ICONS[item.type] || '📦';
  const rarityColor = getRarityColor(data.rarity);
  const conditionColor = data.condition != null ? getConditionColor(data.condition) : '#808080';
  const conditionLabel = data.condition != null ? getConditionLabel(data.condition) : '?';
  const weightLbs = getItemWeightLbs(data);
  const isEquipped = data.equipped === true;
  const isDestroyed = item.status === 'DESTROYED' || data.condition === 0;
  const primaryMaterial = data.primaryMaterial || data.material;
  const properties = uniqueProps(data.properties, data.weaponProperties, data.materialModifiers);

  // Drag handling — mousedown starts tracking; only enters drag mode after threshold; mouseup either clicks or finishes drag.
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !onDragEnd) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        dragging = true;
        setShowDetails(false);
        onDragChange?.(true);
      }
      if (dragging) {
        setDragGhost({ x: ev.clientX, y: ev.clientY });
        onDragHover?.(ev.clientX, ev.clientY);
      }
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setDragGhost(null);
      if (dragging) {
        onDragChange?.(false);
        onDragEnd(item.id, ev.clientX, ev.clientY);
      } else {
        setShowDetails(prev => !prev);
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={dragRef}
      className="border transition-colors"
      style={{
        borderRadius: '2px',
        backgroundColor: isEquipped ? 'rgba(34, 171, 148, 0.08)' : '#2a2a3e',
        borderColor: isEquipped ? 'rgba(34, 171, 148, 0.3)' : '#3a3a4e',
        opacity: isDestroyed ? 0.5 : (dragGhost ? 0.4 : 1),
        cursor: onDragEnd ? 'grab' : 'default',
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="p-2">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-2 flex-1 min-w-0">
            <span style={{ fontSize: '12px' }}>{typeIcon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-medium truncate" style={{ color: rarityColor }}>{item.name}</h4>
                {isEquipped && (
                  <span className="text-white px-1 flex-shrink-0" style={{
                    backgroundColor: '#22ab94',
                    borderRadius: '2px',
                    fontSize: '8px',
                    lineHeight: '14px',
                  }}>E</span>
                )}
                {data.materialClass && (
                  <span className="px-1 flex-shrink-0" style={{
                    backgroundColor: data.materialClass === 'Hard' ? 'rgba(192,192,192,0.15)' : 'rgba(180,140,90,0.15)',
                    color: data.materialClass === 'Hard' ? '#c0c0c0' : '#d4a878',
                    border: `1px solid ${data.materialClass === 'Hard' ? 'rgba(192,192,192,0.3)' : 'rgba(180,140,90,0.3)'}`,
                    borderRadius: '2px',
                    fontSize: '8px',
                    lineHeight: '14px',
                    textTransform: 'uppercase',
                  }}>{data.materialClass}</span>
                )}
                {item.type === 'armor' && data.armorCategory && (
                  <span className="px-1 flex-shrink-0" style={{
                    backgroundColor: 'rgba(0, 47, 108,0.12)',
                    color: '#002f6c',
                    border: '1px solid rgba(0, 47, 108,0.25)',
                    borderRadius: '2px',
                    fontSize: '8px',
                    lineHeight: '14px',
                    textTransform: 'uppercase',
                  }}>{data.armorCategory}</span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap" style={{ fontSize: '9px' }}>
                <span style={{ color: conditionColor }}>{conditionLabel}</span>
                <span style={{ color: '#888' }}>{formatLbs(weightLbs)} lbs</span>
                {primaryMaterial && <span style={{ color: '#666' }}>{primaryMaterial}</span>}
                {data.baseResist != null && <span style={{ color: '#002f6c' }}>R{data.baseResist}</span>}
                {item.type === 'weapon' && data.damage && (
                  <span style={{ color: '#E8585A' }}>
                    {formatDamage(data.damage)}
                    {data.damageScaling ? ' +scl' : ''}
                  </span>
                )}
                {data.quality != null && <span style={{ color: '#c4a0e8' }}>Q{data.quality}</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-1 flex-shrink-0">
            {data.value != null && (
              <span style={{ fontSize: '9px', color: '#ffcc78' }}>{data.value}&#x049C;</span>
            )}
            {onToggleEquip && (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory') && (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleEquip(item.id, !isEquipped); }}
                onMouseDown={e => e.stopPropagation()}
                className="p-0.5 hover:bg-white/10 transition-colors"
                style={{ borderRadius: '2px' }}
                title={isEquipped ? 'Unequip' : 'Equip'}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke={isEquipped ? '#22ab94' : '#666'} strokeWidth={2}>
                  {isEquipped ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  )}
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating popup — comprehensive single-column detail */}
      {showDetails && popupPos && createPortal(
        <div
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: popupPos.left,
            top: popupPos.top,
            width: 320,
            maxHeight: '70vh',
            overflowY: 'auto',
            background: '#1a1a2e',
            border: '1px solid #3a3a4e',
            borderRadius: 4,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            zIndex: 10000,
            padding: 12,
            fontSize: 12,
          }}
        >
          {data.description && (
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginBottom: 6, lineHeight: 1.4 }}>
              {data.description}
            </div>
          )}

          <div className="grid grid-cols-3 gap-1 mt-2">
            <MiniStat label="Weight" value={`${formatLbs(weightLbs)} lbs`} color="#c0c0c0" />
            <MiniStat label="Condition" value={conditionLabel} color={conditionColor} />
            <MiniStat label="Rarity" value={getRarityLabel(data.rarity)} color={rarityColor} />
            {data.quality != null && <MiniStat label="Quality" value={`${data.quality}/10`} color="#c4a0e8" />}
            {data.baseResist != null && <MiniStat label="Resist" value={data.baseResist} color="#002f6c" />}
            {data.value != null && <MiniStat label="Value" value={`${data.value} ҜV`} color="#ffcc78" />}
          </div>

          {/* Materials */}
          {(primaryMaterial || (data.subordinateMaterials && data.subordinateMaterials.length > 0) || data.materialClass) && (
            <div className="mt-2 p-1.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 2 }}>
              <div style={{ fontSize: '8px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Materials</div>
              <div style={{ fontSize: '10px', color: '#fff' }}>
                {primaryMaterial || '—'}
                {data.materialClass && <span style={{ color: '#888', marginLeft: 6 }}>({data.materialClass})</span>}
              </div>
              {data.subordinateMaterials && data.subordinateMaterials.length > 0 && (
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  + {data.subordinateMaterials.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Weapon detail */}
          {item.type === 'weapon' && data.damage && (
            <div className="mt-2 p-1.5" style={{ background: 'rgba(232,88,90,0.08)', border: '1px solid rgba(232,88,90,0.15)', borderRadius: 2 }}>
              <div style={{ fontSize: '8px', color: '#E8585A', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Damage</div>
              <div style={{ fontSize: '11px', color: '#fff', fontWeight: 'bold' }}>
                {formatDamage(data.damage)}
                {data.damageScaling && <span style={{ fontSize: '9px', color: '#ffcc78', marginLeft: 6 }}>scales with wielder</span>}
              </div>
              <div className="flex flex-wrap gap-3 mt-1" style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>
                {data.range && <span>Range: {data.range}</span>}
                {data.targetAttribute && <span>Target: {data.targetAttribute}</span>}
                {data.shots != null && <span>Shots: {data.shots}</span>}
                {data.reload && <span>Reload: {data.reload}</span>}
              </div>
            </div>
          )}

          {/* Armor detail */}
          {item.type === 'armor' && (data.baseResist != null || data.resistance != null || data.armorCategory || data.armorLayer) && (
            <div className="mt-2 p-1.5" style={{ background: 'rgba(0, 47, 108,0.08)', border: '1px solid rgba(0, 47, 108,0.15)', borderRadius: 2 }}>
              <div style={{ fontSize: '8px', color: '#002f6c', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Armor</div>
              <div className="flex flex-wrap gap-3" style={{ fontSize: '10px' }}>
                {(data.baseResist ?? data.resistance) != null && (
                  <span style={{ color: '#fff' }}>Resist: <b>{data.baseResist ?? data.resistance}</b></span>
                )}
                {data.armorCategory && <span style={{ color: 'rgba(255,255,255,0.6)' }}>{data.armorCategory}</span>}
                {!data.armorCategory && data.armorLayer && <span style={{ color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{data.armorLayer.replace(/([A-Z])/g, ' $1').trim()}</span>}
              </div>
            </div>
          )}

          {/* Item abilities (display name + description; KV hidden) */}
          {data.itemAbilities && data.itemAbilities.length > 0 && (
            <div className="mt-2 p-1.5" style={{ background: 'rgba(255,204,120,0.06)', border: '1px solid rgba(255,204,120,0.15)', borderRadius: 2 }}>
              <div style={{ fontSize: '8px', color: '#ffcc78', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Abilities</div>
              <ul style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.itemAbilities.map((ab, i) => (
                  <li key={i}>
                    <div style={{ fontSize: '10px', color: '#fff', fontWeight: 600 }}>{ab.name}</div>
                    <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>{ab.description}</div>
                    {ab.mechanicalEffect && (
                      <div style={{ fontSize: '9px', color: '#22ab94', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>{ab.mechanicalEffect}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Properties (universal) */}
          {properties.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {properties.map((prop, i) => (
                <span key={`${prop}-${i}`} style={{
                  padding: '1px 4px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 2,
                  fontSize: '8px',
                  color: 'rgba(255,255,255,0.7)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {prop}
                </span>
              ))}
            </div>
          )}

          {/* Tags */}
          {data.tags && data.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {data.tags.map((tag, i) => (
                <span key={i} style={{
                  padding: '1px 4px',
                  background: 'rgba(88,42,114,0.15)',
                  border: '1px solid rgba(88,42,114,0.3)',
                  borderRadius: 2,
                  fontSize: '8px',
                  color: '#c4a0e8',
                }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {data.notes && (
            <div className="mt-2 p-1.5" style={{ background: 'rgba(255,204,120,0.06)', border: '1px solid rgba(255,204,120,0.1)', borderRadius: 2 }}>
              <div style={{ fontSize: '8px', color: '#ffcc78', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Notes</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>{data.notes}</div>
            </div>
          )}
        </div>,
        document.body
      )}

      {/* Drag ghost — follows the cursor while a drag is in progress */}
      {dragGhost && createPortal(
        <div
          style={{
            position: 'fixed',
            left: dragGhost.x + 12,
            top: dragGhost.y + 8,
            pointerEvents: 'none',
            zIndex: 10001,
            background: '#1a1a2e',
            border: '1px solid #ffcc78',
            borderRadius: 3,
            padding: '4px 8px',
            fontSize: 11,
            color: rarityColor,
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 13 }}>{typeIcon}</span>
          <span>{item.name}</span>
        </div>,
        document.body
      )}
    </div>
  );
}

function uniqueProps(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const p of list) {
      if (!seen.has(p)) { seen.add(p); out.push(p); }
    }
  }
  return out;
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '2px 0' }}>
      <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{label}</div>
      <div style={{ fontSize: '9px', color, fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}
