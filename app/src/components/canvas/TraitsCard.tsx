"use client";

import React, { useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

export interface TraitItem {
  name: string;
  type: 'nectar' | 'blossom' | 'thorn';
  category?: string;
  description?: string;
  source?: string;
  mechanicalEffect?: string;
}

interface TraitsCardProps {
  traits: TraitItem[];
  fateDie?: string;
  onClose?: () => void;
}

const TYPE_STYLES: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  nectar: { color: '#ffcc78', bg: 'rgba(255,204,120,0.1)', icon: '\u2736', label: 'NECTAR' },
  blossom: { color: '#22ab94', bg: 'rgba(34,171,148,0.1)', icon: '\u2740', label: 'BLOSSOM' },
  thorn: { color: '#E84040', bg: 'rgba(232,64,64,0.1)', icon: '\u2737', label: 'THORN' },
};

const FATE_MAX: Record<string, number> = { d4: 4, d6: 6, d8: 8, d12: 12, d20: 20 };

export default function TraitsCard({ traits, fateDie, onClose }: TraitsCardProps) {
  const [filter, setFilter] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  const safeTraits = Array.isArray(traits) ? traits : [];
  const nectars = safeTraits.filter(t => t.type === 'nectar');
  const blossoms = safeTraits.filter(t => t.type === 'blossom');
  const thorns = safeTraits.filter(t => t.type === 'thorn');
  const maxPermanent = fateDie ? FATE_MAX[fateDie] : undefined;
  const permanentCount = nectars.length + thorns.length;

  const filtered = filter === 'all' ? safeTraits : safeTraits.filter(t => t.type === filter);

  return (
    <div className="border transition-all duration-200" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: '#ffcc78', borderRadius: '3px', width: '400px' }}>
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\u2736'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>NECTARS, BLOSSOMS & THORNS</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {nectars.length} nectars {'\u2022'} {blossoms.length} blossoms {'\u2022'} {thorns.length} thorns
                {maxPermanent !== undefined && <span> {'\u2022'} {permanentCount}/{maxPermanent} permanent</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded); }} onMouseDown={e => e.stopPropagation()} className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
              <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {onClose && (
              <button onClick={e => { e.stopPropagation(); onClose(); }} onMouseDown={e => e.stopPropagation()} className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {[
              { key: 'all', label: 'ALL' },
              { key: 'nectar', label: `NECTARS (${nectars.length})`, color: '#ffcc78' },
              { key: 'blossom', label: `BLOSSOMS (${blossoms.length})`, color: '#22ab94' },
              { key: 'thorn', label: `THORNS (${thorns.length})`, color: '#E84040' },
            ].map(f => (
              <button key={f.key} onClick={e => { e.stopPropagation(); setFilter(f.key); }} onMouseDown={e => e.stopPropagation()}
                className="px-2 py-1 text-xs transition-colors uppercase"
                style={{
                  borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '11px',
                  backgroundColor: filter === f.key ? '#582a72' : '#2a2a3e', color: filter === f.key ? (f.color || '#ffcc78') : '#888',
                  border: `1px solid ${filter === f.key ? (f.color || '#ffcc78') : '#3a3a4e'}`,
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Traits list */}
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-4">No traits found</div>
            ) : filtered.map((trait, i) => {
              const ts = TYPE_STYLES[trait.type] || TYPE_STYLES.nectar;
              return (
                <ComplexTooltip key={i} title={`${ts.icon} ${trait.name}`}
                  modifiers={[
                    ...(trait.category ? [{ name: `Category: ${trait.category}`, value: 0 }] : []),
                    ...(trait.mechanicalEffect ? [{ name: trait.mechanicalEffect, value: 0 }] : []),
                    ...(trait.source ? [{ name: `Source: ${trait.source}`, value: 0, source: { name: trait.source, type: trait.type, description: trait.description } }] : []),
                  ]} totalValue={0}>
                  <div className="p-2 border transition-colors cursor-pointer" onMouseDown={e => e.stopPropagation()}
                    style={{ borderRadius: '2px', backgroundColor: ts.bg, borderColor: '#3a3a4e', borderLeftColor: ts.color, borderLeftWidth: '3px' }}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: ts.color }}>{ts.icon}</span>
                          <span className="text-sm font-medium" style={{ color: ts.color }}>{trait.name}</span>
                          <span className="text-[8px] px-1" style={{ backgroundColor: ts.color, color: '#1a1a2e', borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{ts.label}</span>
                        </div>
                        {trait.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#888' }}>{trait.description}</p>}
                        {trait.mechanicalEffect && <p className="text-[10px] mt-0.5" style={{ color: ts.color, opacity: 0.8 }}>{trait.mechanicalEffect}</p>}
                      </div>
                    </div>
                  </div>
                </ComplexTooltip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
