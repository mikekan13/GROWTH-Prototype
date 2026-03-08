"use client";

import React, { useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

export interface SpellItem {
  name: string;
  school: string;
  description?: string;
  cost?: number;
  strength?: number;
  castingMethod?: string;
}

export interface WovenSpellItem {
  name: string;
  schools: string[];
  description?: string;
  cost?: number;
  strength?: number;
  components?: string;
}

export interface MagicData {
  mercy?: { schools?: string[]; knownSpells?: SpellItem[]; skillLevels?: Record<string, number> };
  severity?: { schools?: string[]; knownSpells?: SpellItem[]; skillLevels?: Record<string, number> };
  balance?: { schools?: string[]; knownSpells?: SpellItem[]; skillLevels?: Record<string, number> };
  wovenSpells?: WovenSpellItem[];
  mana?: { current: number; max: number };
}

interface MagicCardProps {
  magic: MagicData;
  onClose?: () => void;
}

const PILLAR_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  mercy: { label: 'MERCY', color: '#3EB89A', icon: '\u2661' },
  severity: { label: 'SEVERITY', color: '#E8585A', icon: '\u2694' },
  balance: { label: 'BALANCE', color: '#7050A8', icon: '\u2696' },
};

const SCHOOL_ICONS: Record<string, string> = {
  Fortune: '\u2618', Restoration: '\u2720', Enchantment: '\u2764',
  Force: '\u26A1', Alteration: '\u2699', Conjuration: '\u2726',
  Divination: '\u2609', Dissolution: '\u2620', Abjuration: '\u2721', Illusion: '\u25C8',
};

export default function MagicCard({ magic, onClose }: MagicCardProps) {
  const [activePillar, setActivePillar] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  const pillars = ['mercy', 'severity', 'balance'] as const;
  const totalSpells = pillars.reduce((sum, p) => sum + (magic[p]?.knownSpells?.length || 0), 0);
  const wovenCount = magic.wovenSpells?.length || 0;

  return (
    <div className="border transition-all duration-200" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: '#ffcc78', borderRadius: '3px', width: '440px' }}>
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\u2728'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>MAGIC</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {totalSpells} spells{wovenCount > 0 && ` \u2022 ${wovenCount} woven`}
                {magic.mana && ` \u2022 Mana ${magic.mana.current}/${magic.mana.max}`}
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
          {/* Mana bar */}
          {magic.mana && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[9px] uppercase" style={{ color: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>MANA</span>
                <span className="text-xs font-bold" style={{ color: '#22ab94' }}>{magic.mana.current}/{magic.mana.max}</span>
              </div>
              <div className="h-2 rounded overflow-hidden" style={{ backgroundColor: '#2a2a3e' }}>
                <div className="h-full rounded transition-all duration-300" style={{
                  width: `${magic.mana.max > 0 ? (magic.mana.current / magic.mana.max) * 100 : 0}%`,
                  background: 'linear-gradient(90deg, #22ab94 0%, #3EB89A 100%)',
                }} />
              </div>
            </div>
          )}

          {/* Pillar tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            <button onClick={e => { e.stopPropagation(); setActivePillar('all'); }} onMouseDown={e => e.stopPropagation()}
              className="px-2 py-1 text-xs transition-colors uppercase"
              style={{
                borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '11px',
                backgroundColor: activePillar === 'all' ? '#582a72' : '#2a2a3e', color: activePillar === 'all' ? '#ffcc78' : '#888',
                border: `1px solid ${activePillar === 'all' ? '#ffcc78' : '#3a3a4e'}`,
              }}>ALL</button>
            {pillars.map(p => {
              const ps = PILLAR_STYLES[p];
              const count = magic[p]?.knownSpells?.length || 0;
              if (count === 0 && !(magic[p]?.schools?.length)) return null;
              return (
                <button key={p} onClick={e => { e.stopPropagation(); setActivePillar(p); }} onMouseDown={e => e.stopPropagation()}
                  className="px-2 py-1 text-xs transition-colors uppercase"
                  style={{
                    borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '11px',
                    backgroundColor: activePillar === p ? ps.color : '#2a2a3e', color: activePillar === p ? 'white' : ps.color,
                    border: `1px solid ${activePillar === p ? ps.color : `${ps.color}40`}`,
                  }}>{ps.icon} {ps.label} ({count})</button>
              );
            })}
            {wovenCount > 0 && (
              <button onClick={e => { e.stopPropagation(); setActivePillar('woven'); }} onMouseDown={e => e.stopPropagation()}
                className="px-2 py-1 text-xs transition-colors uppercase"
                style={{
                  borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '11px',
                  backgroundColor: activePillar === 'woven' ? '#D0A030' : '#2a2a3e', color: activePillar === 'woven' ? '#1a1a2e' : '#D0A030',
                  border: `1px solid ${activePillar === 'woven' ? '#ffcc78' : '#D0A03040'}`,
                }}>{'\u2728'} WOVEN ({wovenCount})</button>
            )}
          </div>

          {/* School badges */}
          <div className="flex gap-1 mb-3 flex-wrap">
            {pillars.map(p => {
              if (activePillar !== 'all' && activePillar !== p) return null;
              const ps = PILLAR_STYLES[p];
              return (magic[p]?.schools || []).map(school => (
                <span key={school} className="inline-flex items-center gap-0.5 px-1 text-[9px]"
                  style={{ backgroundColor: `${ps.color}20`, border: `1px solid ${ps.color}40`, color: ps.color, borderRadius: '2px' }}>
                  {SCHOOL_ICONS[school] || '\u2728'} {school}
                  {magic[p]?.skillLevels?.[school] !== undefined && (
                    <span style={{ color: '#ffcc78' }}> Lv{magic[p]!.skillLevels![school]}</span>
                  )}
                </span>
              ));
            })}
          </div>

          {/* Spells */}
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {pillars.map(p => {
              if (activePillar !== 'all' && activePillar !== p) return null;
              const ps = PILLAR_STYLES[p];
              const spells = magic[p]?.knownSpells || [];
              if (spells.length === 0) return null;
              return (
                <div key={p}>
                  {activePillar === 'all' && (
                    <div className="text-[9px] uppercase mb-1 mt-2" style={{ color: ps.color, fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
                      {ps.icon} {ps.label}
                    </div>
                  )}
                  {spells.map((spell, i) => (
                    <ComplexTooltip key={i} title={`${SCHOOL_ICONS[spell.school] || '\u2728'} ${spell.name}`}
                      modifiers={[
                        { name: `School: ${spell.school}`, value: 0 },
                        ...(spell.strength ? [{ name: `Strength: ${spell.strength}/10`, value: spell.strength }] : []),
                        ...(spell.castingMethod ? [{ name: `Method: ${spell.castingMethod === 'weaving' ? 'Spell Weaving' : 'Wild Casting'}`, value: 0 }] : []),
                        ...(spell.description ? [{ name: spell.description, value: 0 }] : []),
                      ]} totalValue={spell.cost || 0}>
                      <div className="p-1.5 border transition-colors cursor-pointer" onMouseDown={e => e.stopPropagation()}
                        style={{ borderRadius: '2px', backgroundColor: '#2a2a3e', borderColor: '#3a3a4e', borderLeftColor: ps.color, borderLeftWidth: '3px' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <span style={{ color: ps.color }}>{SCHOOL_ICONS[spell.school] || '\u2728'}</span>
                            <span className="text-sm text-white truncate">{spell.name}</span>
                            <span className="text-[8px] px-1" style={{ backgroundColor: '#3a3a4e', color: '#888', borderRadius: '2px' }}>{spell.school}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {spell.strength && <span className="text-[9px]" style={{ color: '#888' }}>Str {spell.strength}</span>}
                            {spell.cost !== undefined && (
                              <span className="text-[10px] px-1" style={{ backgroundColor: '#1a1a2e', color: '#22ab94', border: '1px solid #22ab9440', borderRadius: '2px' }}>{spell.cost}</span>
                            )}
                          </div>
                        </div>
                        {spell.description && <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: '#666' }}>{spell.description}</p>}
                      </div>
                    </ComplexTooltip>
                  ))}
                </div>
              );
            })}

            {/* Woven spells */}
            {(activePillar === 'all' || activePillar === 'woven') && magic.wovenSpells && magic.wovenSpells.length > 0 && (
              <div>
                <div className="text-[9px] uppercase mb-1 mt-2" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
                  {'\u2728'} WOVEN SPELLS
                </div>
                {magic.wovenSpells.map((spell, i) => (
                  <ComplexTooltip key={i} title={`\u2728 ${spell.name} (Woven)`}
                    modifiers={spell.schools.map(s => ({ name: s, value: 0 }))}
                    totalValue={spell.cost || 0}>
                    <div className="p-1.5 border transition-colors cursor-pointer" onMouseDown={e => e.stopPropagation()}
                      style={{ borderRadius: '2px', backgroundColor: 'rgba(255,204,120,0.05)', borderColor: '#3a3a4e', borderLeftColor: '#ffcc78', borderLeftWidth: '3px' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <span style={{ color: '#ffcc78' }}>{'\u2728'}</span>
                          <span className="text-sm text-white truncate">{spell.name}</span>
                        </div>
                        {spell.cost !== undefined && (
                          <span className="text-[10px] px-1 flex-shrink-0" style={{ backgroundColor: '#1a1a2e', color: '#ffcc78', border: '1px solid #ffcc7840', borderRadius: '2px' }}>{spell.cost}</span>
                        )}
                      </div>
                      <div className="flex gap-1 mt-0.5">
                        {spell.schools.map((s, j) => (
                          <span key={j} className="text-[8px] px-1" style={{ backgroundColor: '#3a3a4e', color: '#c4a0e8', borderRadius: '2px' }}>{s}</span>
                        ))}
                      </div>
                      {spell.description && <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: '#666' }}>{spell.description}</p>}
                    </div>
                  </ComplexTooltip>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
