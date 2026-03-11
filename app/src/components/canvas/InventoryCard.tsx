"use client";

import React, { useState, useRef } from 'react';
import type { HeldItemData, GrowthWorldItem, WorldItemType } from '@/types/item';
import { ITEM_TYPE_ICONS, RARITY_COLORS, formatDamage, getConditionLabel, getConditionColor } from '@/types/item';
import { getWeightLabel } from '@/types/material';

// ── Props ────────────────────────────────────────────────────────────────────

interface InventoryCardProps {
  characterId: string;
  characterName: string;
  carryLevel: number;        // From vitals.carryLevel (= Clout attribute)
  items: HeldItemData[];
  isDropTarget?: boolean;    // Glow when item is being dragged over
  isGM?: boolean;
  onRemoveItem?: (itemId: string) => void;
  onToggleEquip?: (itemId: string, equipped: boolean) => void;
  onClose?: () => void;
  onDragOutStart?: (itemId: string, e: React.MouseEvent) => void;
}

// ── Weight Status ────────────────────────────────────────────────────────────

type WeightStatus = 'Fine' | 'Near Limit' | 'Encumbered' | 'Overloaded';

function getWeightStatus(totalWeight: number, carryLevel: number): WeightStatus {
  if (totalWeight <= carryLevel) return 'Fine';
  if (totalWeight <= carryLevel + 1) return 'Near Limit';
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
  characterId: _characterId,
  characterName: _characterName,
  carryLevel,
  items,
  isDropTarget,
  isGM,
  onRemoveItem,
  onToggleEquip,
  onClose,
  onDragOutStart,
}: InventoryCardProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  const safeItems = Array.isArray(items) ? items : [];

  // Calculate total weight from held items
  const totalWeight = safeItems.reduce((sum, item) => sum + (item.data.weightLevel ?? 0), 0);
  const equippedCount = safeItems.filter(i => i.data.equipped).length;
  const totalValue = safeItems.reduce((sum, item) => sum + (item.data.value ?? 0), 0);
  const weightStatus = getWeightStatus(totalWeight, carryLevel);

  const filteredItems = safeItems.filter(item => matchesFilter(item, filter));

  return (
    <div
      className="border transition-all duration-200"
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#1a1a2e',
        borderColor: isDropTarget ? '#4ade80' : '#ffcc78',
        borderRadius: '3px',
        borderWidth: isDropTarget ? '2px' : '1px',
        boxShadow: isDropTarget ? '0 0 20px rgba(74, 222, 128, 0.3)' : 'none',
      }}
    >
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\uD83C\uDF92'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>INVENTORY</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {safeItems.length} items {'\u2022'} W{totalWeight}/{carryLevel}
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
          background: 'rgba(74, 222, 128, 0.1)',
          borderBottom: '1px solid rgba(74, 222, 128, 0.2)',
          textAlign: 'center',
          fontSize: '10px',
          color: '#4ade80',
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
            {/* Carry Weight */}
            <div className="p-2 text-center" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', border: '1px solid #3a3a4e' }}>
              <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>CARRY</div>
              <div className="text-sm font-bold" style={{ color: getWeightStatusColor(weightStatus) }}>
                {totalWeight}/{carryLevel}
              </div>
              <div className="text-xs" style={{ color: getWeightStatusColor(weightStatus), fontSize: '8px' }}>
                {weightStatus}
              </div>
            </div>
            {/* Equipped */}
            <div className="p-2 text-center" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', border: '1px solid #3a3a4e' }}>
              <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>EQUIPPED</div>
              <div className="text-sm font-bold text-green-400">{equippedCount}</div>
            </div>
            {/* Total KV */}
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
                  onDragOutStart={onDragOutStart}
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

function InventoryItemRow({
  item,
  isGM,
  onRemove,
  onToggleEquip,
  onDragOutStart,
}: {
  item: HeldItemData;
  isGM?: boolean;
  onRemove?: (itemId: string) => void;
  onToggleEquip?: (itemId: string, equipped: boolean) => void;
  onDragOutStart?: (itemId: string, e: React.MouseEvent) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);

  const data = item.data;
  const typeIcon = ITEM_TYPE_ICONS[item.type] || '\uD83D\uDCE6';
  const rarityColor = data.rarity ? RARITY_COLORS[data.rarity] : '#c0c0c0';
  const conditionColor = data.condition ? getConditionColor(data.condition) : '#808080';
  const conditionLabel = data.condition ? getConditionLabel(data.condition) : '?';
  const weightLabel = getWeightLabel(data.weightLevel ?? 0);
  const isEquipped = data.equipped === true;
  const isDestroyed = item.status === 'DESTROYED' || data.condition === 1;

  return (
    <div
      ref={dragRef}
      className="border transition-colors"
      style={{
        borderRadius: '2px',
        backgroundColor: isEquipped ? 'rgba(34, 171, 148, 0.08)' : '#2a2a3e',
        borderColor: isEquipped ? 'rgba(34, 171, 148, 0.3)' : '#3a3a4e',
        opacity: isDestroyed ? 0.5 : 1,
        cursor: onDragOutStart ? 'grab' : 'default',
      }}
      onMouseDown={(e) => {
        if (e.button !== 0 || !onDragOutStart) return;
        // Only start drag if not clicking a button
        if ((e.target as HTMLElement).closest('button')) return;
        e.stopPropagation();
        onDragOutStart(item.id, e);
      }}
    >
      {/* Main row */}
      <div
        className="p-2"
        onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
        onMouseDown={e => { if ((e.target as HTMLElement).closest('button')) return; e.stopPropagation(); }}
      >
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
              </div>
              {/* Compact stat line */}
              <div className="flex items-center gap-2 mt-0.5" style={{ fontSize: '9px' }}>
                <span style={{ color: conditionColor }}>{conditionLabel}</span>
                <span style={{ color: '#888' }}>W{data.weightLevel ?? 0}</span>
                {data.material && <span style={{ color: '#666' }}>{data.material}</span>}
                {item.type === 'weapon' && data.damage && (
                  <span style={{ color: '#E8585A' }}>{formatDamage(data.damage)}</span>
                )}
                {item.type === 'armor' && data.resistance != null && (
                  <span style={{ color: '#3E78C0' }}>R{data.resistance}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right side: value + actions */}
          <div className="flex items-center gap-1 ml-1 flex-shrink-0">
            {data.value != null && (
              <span style={{ fontSize: '9px', color: '#ffcc78' }}>{data.value}&#x049C;</span>
            )}
            {/* Equip toggle */}
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
            {/* Remove button (GM only) */}
            {onRemove && isGM && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                onMouseDown={e => e.stopPropagation()}
                className="p-0.5 hover:bg-red-500/20 transition-colors"
                style={{ borderRadius: '2px' }}
                title="Remove from inventory"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="#E8585A" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {showDetails && (
        <div className="px-2 pb-2 border-t" style={{ borderColor: '#3a3a4e' }}>
          {/* Description */}
          {data.description && (
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.4 }}>
              {data.description}
            </div>
          )}

          {/* Stat grid */}
          <div className="grid grid-cols-4 gap-1 mt-2">
            <MiniStat label="Weight" value={`${data.weightLevel ?? 0} (${weightLabel})`} color="#c0c0c0" />
            <MiniStat label="Condition" value={conditionLabel} color={conditionColor} />
            <MiniStat label="Tech" value={data.techLevel ?? '-'} color="#22ab94" />
            <MiniStat label="Rarity" value={data.rarity ? data.rarity.replace('_', ' ') : 'common'} color={rarityColor} />
          </div>

          {/* Weapon damage detail */}
          {item.type === 'weapon' && data.damage && (
            <div className="mt-2 p-1.5" style={{ background: 'rgba(232,88,90,0.08)', border: '1px solid rgba(232,88,90,0.15)', borderRadius: 2 }}>
              <div style={{ fontSize: '8px', color: '#E8585A', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Damage</div>
              <div style={{ fontSize: '11px', color: '#fff', fontWeight: 'bold' }}>{formatDamage(data.damage)}</div>
              <div className="flex gap-3 mt-1" style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)' }}>
                {data.range && <span>Range: {data.range}</span>}
                {data.targetAttribute && <span>Target: {data.targetAttribute}</span>}
              </div>
            </div>
          )}

          {/* Armor detail */}
          {item.type === 'armor' && data.resistance != null && (
            <div className="mt-2 p-1.5" style={{ background: 'rgba(62,120,192,0.08)', border: '1px solid rgba(62,120,192,0.15)', borderRadius: 2 }}>
              <div style={{ fontSize: '8px', color: '#3E78C0', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Armor</div>
              <div className="flex gap-3" style={{ fontSize: '10px' }}>
                <span style={{ color: '#fff' }}>Resist: <b>{data.resistance}</b></span>
                {data.armorLayer && <span style={{ color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' }}>{data.armorLayer.replace(/([A-Z])/g, ' $1').trim()}</span>}
              </div>
              {data.coveredParts && data.coveredParts.length > 0 && (
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                  Covers: {data.coveredParts.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* Material modifiers */}
          {data.materialModifiers && data.materialModifiers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {data.materialModifiers.map((mod, i) => (
                <span key={i} style={{
                  padding: '1px 4px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 2,
                  fontSize: '8px',
                  color: 'rgba(255,255,255,0.5)',
                  textTransform: 'uppercase',
                }}>
                  {mod}
                </span>
              ))}
            </div>
          )}

          {/* Weapon properties */}
          {data.weaponProperties && data.weaponProperties.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {data.weaponProperties.map((prop, i) => (
                <span key={i} style={{
                  padding: '1px 4px',
                  background: 'rgba(232,88,90,0.08)',
                  border: '1px solid rgba(232,88,90,0.15)',
                  borderRadius: 2,
                  fontSize: '8px',
                  color: '#E8585A',
                  textTransform: 'uppercase',
                }}>
                  {prop}
                </span>
              ))}
            </div>
          )}

          {/* GM Notes */}
          {data.notes && (
            <div className="mt-2 p-1.5" style={{ background: 'rgba(255,204,120,0.06)', border: '1px solid rgba(255,204,120,0.1)', borderRadius: 2 }}>
              <div style={{ fontSize: '8px', color: '#ffcc78', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Notes</div>
              <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.5)' }}>{data.notes}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '2px 0' }}>
      <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{label}</div>
      <div style={{ fontSize: '9px', color, fontWeight: 'bold' }}>{value}</div>
    </div>
  );
}
