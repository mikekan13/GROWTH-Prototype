"use client";

import React, { useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

export interface ItemAugment {
  attribute: string;  // e.g. 'clout', 'constitution', 'willpower'
  value: number;      // positive = buff, negative = penalty
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'accessory' | 'consumable' | 'tool' | 'misc';
  quantity: number;
  equipped?: boolean;
  description?: string;
  properties?: string[];
  augments?: ItemAugment[];  // Attribute modifiers when equipped
  value?: number;
  weight?: number;
  rarity?: 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact';
}

interface InventoryCardProps {
  characterName: string;
  items: InventoryItem[];
  onItemEdit?: (item: InventoryItem) => void;
  onItemAdd?: () => void;
  onClose?: () => void;
}

const ITEM_TYPE_ICONS: Record<string, string> = {
  weapon: '\u2694\uFE0F',
  armor: '\uD83D\uDEE1\uFE0F',
  accessory: '\uD83D\uDCFF',
  consumable: '\uD83E\uDDEA',
  tool: '\uD83D\uDD27',
  misc: '\uD83D\uDCE6',
};

const RARITY_TEXT_COLORS: Record<string, string> = {
  common: '#c0c0c0',
  uncommon: '#4ade80',
  rare: '#60a5fa',
  'very rare': '#c4a0e8',
  legendary: '#ffcc78',
  artifact: '#f7525f',
};

const ATTR_LABELS: Record<string, string> = {
  clout: 'Clout', celerity: 'Celerity', constitution: 'Constitution',
  flow: 'Flow', focus: 'Focus',
  willpower: 'Willpower', wisdom: 'Wisdom', wit: 'Wit',
};

function buildItemModifiers(item: InventoryItem) {
  const modifiers: Array<{
    name: string;
    value: number;
    source?: { name: string; type: string; description?: string; stats?: Record<string, string | number> };
  }> = [];

  const sourceInfo = {
    name: item.name,
    type: `${item.type} — ${item.rarity || 'common'}`,
    description: item.description,
    stats: {
      ...(item.value != null ? { 'Value': `${item.value} \u049CV` } : {}),
      ...(item.weight != null ? { 'Weight': `${item.weight} lb` } : {}),
      ...(item.quantity > 1 ? { 'Quantity': item.quantity } : {}),
      ...(item.equipped ? { 'Status': 'Equipped' } : {}),
    },
  };

  // Show attribute augments
  if (item.augments && item.augments.length > 0) {
    item.augments.forEach((aug) => {
      modifiers.push({
        name: `${ATTR_LABELS[aug.attribute] || aug.attribute} ${aug.value >= 0 ? '+' : ''}${aug.value}`,
        value: aug.value,
        source: sourceInfo,
      });
    });
  }

  // Show properties
  if (item.properties) {
    item.properties.forEach((prop) => {
      modifiers.push({ name: prop, value: 0, source: sourceInfo });
    });
  }

  if (modifiers.length === 0) {
    modifiers.push({ name: item.type, value: 0, source: sourceInfo });
  }

  return modifiers;
}

export default function InventoryCard({ characterName: _characterName, items, onItemEdit, onItemAdd, onClose }: InventoryCardProps) {
  const [filter, setFilter] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  const safeItems = Array.isArray(items) ? items : [];
  const totalWeight = safeItems.reduce((sum, item) => sum + ((item.weight || 0) * item.quantity), 0);
  const equippedItems = safeItems.filter(item => item.equipped);

  const filteredItems = safeItems.filter(item =>
    filter === 'all' || item.type === filter || (filter === 'equipped' && item.equipped)
  );

  return (
    <div
      className="border transition-all duration-200"
      style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: '#ffcc78', borderRadius: '3px' }}
    >
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\uD83C\uDF92'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>INVENTORY</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>{safeItems.length} items {'\u2022'} {totalWeight.toFixed(1)} lbs</p>
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
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
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

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {['all', 'equipped', 'weapon', 'armor', 'consumable', 'misc'].map((filterType) => (
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

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="p-2 text-center" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', border: '1px solid #3a3a4e' }}>
              <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>EQUIPPED</div>
              <div className="text-sm font-bold text-green-400">{equippedItems.length}</div>
            </div>
            <div className="p-2 text-center" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', border: '1px solid #3a3a4e' }}>
              <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>TOTAL VALUE</div>
              <div className="text-sm font-bold" style={{ color: '#ffcc78' }}>
                {safeItems.reduce((sum, item) => sum + ((item.value || 0) * item.quantity), 0)} &#x049C;V
              </div>
            </div>
            <div className="p-2 text-center" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', border: '1px solid #3a3a4e' }}>
              <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>WEIGHT</div>
              <div className="text-sm font-bold" style={{ color: '#22ab94' }}>{totalWeight.toFixed(1)} lbs</div>
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {filteredItems.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">
                No items found
              </div>
            ) : (
              filteredItems.map((item) => (
                <ComplexTooltip
                  key={item.id}
                  title={`${ITEM_TYPE_ICONS[item.type] || '\uD83D\uDCE6'} ${item.name}`}
                  baseValue={item.value}
                  modifiers={buildItemModifiers(item)}
                  totalValue={item.quantity}
                >
                  <div
                    className="p-2 border transition-colors cursor-pointer"
                    style={{
                      borderRadius: '2px',
                      backgroundColor: item.equipped ? 'rgba(34, 171, 148, 0.1)' : '#2a2a3e',
                      borderColor: item.equipped ? 'rgba(34, 171, 148, 0.4)' : '#3a3a4e',
                    }}
                    onClick={(e) => { e.stopPropagation(); onItemEdit?.(item); }}
                    onMouseDown={e => e.stopPropagation()}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-2 flex-1 min-w-0">
                        <span className="text-sm">{ITEM_TYPE_ICONS[item.type] || '\uD83D\uDCE6'}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-sm font-medium truncate" style={{ color: item.rarity && RARITY_TEXT_COLORS[item.rarity] ? RARITY_TEXT_COLORS[item.rarity] : '#e0e0e0' }}>{item.name}</h4>
                            {item.equipped && (
                              <span className="text-xs text-white px-1" style={{ backgroundColor: '#22ab94', borderRadius: '2px', fontSize: '9px' }}>E</span>
                            )}
                            {item.quantity > 1 && (
                              <span className="text-xs text-white px-1" style={{ backgroundColor: '#3a3a4e', borderRadius: '2px', fontSize: '9px' }}>x{item.quantity}</span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs mt-1 line-clamp-2" style={{ color: '#888' }}>{item.description}</p>
                          )}
                          {((item.properties && item.properties.length > 0) || (item.augments && item.augments.length > 0)) && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.augments?.map((aug, index) => (
                                <span key={`aug-${index}`} className="text-xs px-1" style={{
                                  backgroundColor: aug.value >= 0 ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                                  color: aug.value >= 0 ? '#4ade80' : '#f87171',
                                  borderRadius: '2px',
                                }}>
                                  {ATTR_LABELS[aug.attribute] || aug.attribute} {aug.value >= 0 ? '+' : ''}{aug.value}
                                </span>
                              ))}
                              {item.properties?.slice(0, 3).map((prop, index) => (
                                <span key={index} className="text-xs px-1" style={{ backgroundColor: 'rgba(88, 42, 114, 0.3)', color: '#c4a0e8', borderRadius: '2px' }}>
                                  {prop}
                                </span>
                              ))}
                              {(item.properties?.length || 0) > 3 && (
                                <span className="text-xs" style={{ color: '#888' }}>+{(item.properties?.length || 0) - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs ml-2" style={{ color: '#ffcc78' }}>
                        {item.value != null && <div>{item.value} &#x049C;V</div>}
                        {item.weight != null && <div style={{ color: '#888' }}>{item.weight} lb</div>}
                      </div>
                    </div>
                  </div>
                </ComplexTooltip>
              ))
            )}
          </div>

          {/* Add Item Button */}
          <button
            onClick={(e) => { e.stopPropagation(); onItemAdd?.(); }}
            onMouseDown={e => e.stopPropagation()}
            className="w-full mt-3 p-2 border-2 border-dashed transition-colors text-sm"
            style={{
              borderRadius: '2px',
              borderColor: '#3a3a4e',
              color: '#888',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              letterSpacing: '0.08em',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ffcc78'; e.currentTarget.style.color = '#ffcc78'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#3a3a4e'; e.currentTarget.style.color = '#888'; }}
          >
            + ADD ITEM
          </button>
        </div>
      )}
    </div>
  );
}
