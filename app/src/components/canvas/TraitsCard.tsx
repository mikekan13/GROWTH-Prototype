"use client";

import React, { useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

export interface TraitItem {
  name: string;
  type: 'nectar' | 'blossom' | 'thorn';
  pillar?: 'body' | 'spirit' | 'soul';
  category?: string;
  description?: string;
  source?: string;
  mechanicalEffect?: string;
  /** Blossom only: lifetime in meta cycles (granter-set). */
  durationCycles?: number;
  /** Blossom only: campaign-clock cycle at which it auto-expires (T23 sweep). */
  expiresAtCycle?: number;
}

interface TraitsCardProps {
  traits: TraitItem[];
  fateDie?: string;
  /** For the bearer-agnostic linter — trait text should say "the bearer", never the character's name. */
  characterName?: string;
  onClose?: () => void;
  onAddTrait?: (trait: TraitItem) => void;
  onRemoveTrait?: (type: 'nectar' | 'blossom' | 'thorn', name: string) => void;
  onUpdateTrait?: (type: 'nectar' | 'blossom' | 'thorn', name: string, updates: Partial<TraitItem>) => void;
}

const TYPE_STYLES: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  nectar: { color: 'var(--krma-gold)', bg: 'rgba(255,204,120,0.1)', icon: '\u2736', label: 'NECTAR' },
  blossom: { color: 'var(--terminal-prime)', bg: 'rgba(34,171,148,0.1)', icon: '\u2740', label: 'BLOSSOM' },
  thorn: { color: '#E84040', bg: 'rgba(232,64,64,0.1)', icon: '\u2737', label: 'THORN' },
};

const FATE_MAX: Record<string, number> = { d4: 4, d6: 6, d8: 8, d12: 12, d20: 20 };

export default function TraitsCard({ traits, fateDie, characterName, onClose, onAddTrait, onRemoveTrait, onUpdateTrait }: TraitsCardProps) {
  const [filter, setFilter] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'nectar' | 'blossom' | 'thorn'>('nectar');
  const [newPillar, setNewPillar] = useState<'body' | 'spirit' | 'soul'>('spirit');
  const [newDescription, setNewDescription] = useState('');
  const [newEffect, setNewEffect] = useState('');
  const [newDuration, setNewDuration] = useState<string>(''); // blossom only, cycles
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editEffect, setEditEffect] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const isEditable = !!(onAddTrait || onRemoveTrait || onUpdateTrait);

  const resetAdd = () => {
    setNewName(''); setNewType('nectar'); setNewPillar('spirit'); setNewDescription(''); setNewEffect(''); setNewDuration(''); setShowAddForm(false);
  };
  const submitAdd = () => {
    if (!onAddTrait || !newName.trim()) return;
    const duration = newType === 'blossom' ? parseFloat(newDuration) : NaN;
    onAddTrait({
      name: newName.trim(),
      type: newType,
      pillar: newPillar,
      category: 'utility',
      description: newDescription.trim() || undefined,
      mechanicalEffect: newEffect.trim() || undefined,
      source: 'Manual',
      ...(Number.isFinite(duration) && duration > 0 ? { durationCycles: duration } : {}),
    });
    resetAdd();
  };
  const startEdit = (t: TraitItem) => {
    setEditingKey(`${t.type}::${t.name.toLowerCase()}`);
    setEditEffect(t.mechanicalEffect ?? '');
    setEditDescription(t.description ?? '');
  };
  const saveEdit = (t: TraitItem) => {
    if (!onUpdateTrait) return;
    onUpdateTrait(t.type, t.name, { description: editDescription, mechanicalEffect: editEffect });
    setEditingKey(null);
  };

  const safeTraits = Array.isArray(traits) ? traits : [];
  const nectars = safeTraits.filter(t => t.type === 'nectar');
  const blossoms = safeTraits.filter(t => t.type === 'blossom');
  const thorns = safeTraits.filter(t => t.type === 'thorn');
  const maxPermanent = fateDie ? FATE_MAX[fateDie] : undefined;
  const permanentCount = nectars.length + thorns.length;

  // INV-07: Nectar+Thorn cap = Fate Die value; Blossoms exempt.
  const capReached = newType !== 'blossom' && maxPermanent !== undefined && permanentCount >= maxPermanent;

  // Bearer-agnostic linter (INV-28): trait text says "the bearer", never the
  // character's name. Warning only — the GM may have a reason.
  const nameTokens = (characterName ?? '')
    .split(/\s+/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= 3);
  const traitText = `${newName} ${newDescription} ${newEffect}`.toLowerCase();
  const bearerWarning = nameTokens.some(t => traitText.includes(t));

  const canAdd = !!newName.trim() && !capReached;

  const filtered = filter === 'all' ? safeTraits : safeTraits.filter(t => t.type === filter);

  return (
    <div className="border transition-all duration-200" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: 'var(--krma-gold)', borderRadius: '3px', width: '400px' }}>
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, var(--pillar-spirit) 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\u2736'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>NECTARS, BLOSSOMS & THORNS</h3>
              <p className="text-xs" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {nectars.length} nectars {'\u2022'} {blossoms.length} blossoms {'\u2022'} {thorns.length} thorns
                {maxPermanent !== undefined && <span> {'\u2022'} {permanentCount}/{maxPermanent} permanent</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isEditable && onAddTrait && (
              <button onClick={e => { e.stopPropagation(); setShowAddForm(s => !s); }} onMouseDown={e => e.stopPropagation()}
                className="p-1 hover:bg-white/20 transition-colors text-xs" style={{ borderRadius: '2px', color: 'var(--krma-gold)' }}>
                +
              </button>
            )}
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
          {/* Add Trait form */}
          {showAddForm && onAddTrait && (
            <div className="mb-3 p-2 border" style={{ borderColor: 'var(--krma-gold)', borderRadius: '2px', backgroundColor: '#2a2a3e' }}>
              <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--krma-gold)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Add Trait</div>
              <div className="space-y-2">
                <div className="flex gap-1">
                  {(['nectar','blossom','thorn'] as const).map(t => (
                    <button key={t} type="button" onClick={e => { e.stopPropagation(); setNewType(t); }} onMouseDown={e => e.stopPropagation()}
                      className="px-2 py-0.5 text-[9px] uppercase"
                      style={{ borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em',
                        backgroundColor: newType === t ? TYPE_STYLES[t].color : '#1a1a2e',
                        color: newType === t ? '#1a1a2e' : TYPE_STYLES[t].color,
                        border: `1px solid ${TYPE_STYLES[t].color}` }}>{TYPE_STYLES[t].label}</button>
                  ))}
                </div>
                <div className="flex gap-1 items-center">
                  <span className="text-[9px]" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>Pillar:</span>
                  {([
                    { key: 'body' as const, color: 'var(--pillar-body)', label: 'BODY' },
                    { key: 'spirit' as const, color: '#8e7cc3', label: 'SPIRIT' },
                    { key: 'soul' as const, color: '#6fa8dc', label: 'SOUL' },
                  ]).map(p => (
                    <button key={p.key} type="button" onClick={e => { e.stopPropagation(); setNewPillar(p.key); }} onMouseDown={e => e.stopPropagation()}
                      className="px-2 py-0.5 text-[9px] uppercase"
                      style={{ borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em',
                        backgroundColor: newPillar === p.key ? p.color : '#1a1a2e',
                        color: newPillar === p.key ? '#fff' : p.color,
                        border: `1px solid ${p.color}` }}>{p.label}</button>
                  ))}
                </div>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onMouseDown={e => e.stopPropagation()}
                  placeholder="Trait name..." autoFocus
                  className="w-full bg-transparent outline-none text-sm text-white px-1 py-0.5 border-b"
                  style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
                <input type="text" value={newDescription} onChange={e => setNewDescription(e.target.value)} onMouseDown={e => e.stopPropagation()}
                  placeholder="Description..."
                  className="w-full bg-transparent outline-none text-[10px] text-gray-300 px-1 py-0.5 border-b"
                  style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
                <input type="text" value={newEffect} onChange={e => setNewEffect(e.target.value)} onMouseDown={e => e.stopPropagation()}
                  placeholder="Mechanical effect (e.g. +1 melee, KV:5)..."
                  className="w-full bg-transparent outline-none text-[10px] text-gray-300 px-1 py-0.5 border-b"
                  style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
                {/* Blossom duration (cycles on the campaign clock; blank = open-ended) */}
                {newType === 'blossom' && (
                  <div className="flex gap-2 items-center">
                    <label className="text-[9px]" style={{ color: 'var(--terminal-prime)' }}>Duration (cycles):</label>
                    <input type="number" value={newDuration} onChange={e => setNewDuration(e.target.value)} onMouseDown={e => e.stopPropagation()}
                      min={0} step="any" placeholder="∞"
                      className="w-16 bg-transparent outline-none text-[10px] text-white px-1 py-0.5 border"
                      style={{ borderColor: '#3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
                    <span className="text-[8px]" style={{ color: '#666' }}>auto-expires as the clock advances</span>
                  </div>
                )}
                {/* INV-07 cap block */}
                {capReached && (
                  <div className="text-[9px] px-1.5 py-1" style={{ color: '#E84040', backgroundColor: 'rgba(232,64,64,0.1)', border: '1px solid rgba(232,64,64,0.3)', borderRadius: '2px' }}>
                    Trait cap reached: {permanentCount}/{maxPermanent} permanent traits (Fate Die {fateDie}). Blossoms are exempt.
                  </div>
                )}
                {/* Bearer-agnostic linter (warning only) */}
                {bearerWarning && (
                  <div className="text-[9px] px-1.5 py-1" style={{ color: '#D0A030', backgroundColor: 'rgba(208,160,48,0.1)', border: '1px solid rgba(208,160,48,0.3)', borderRadius: '2px' }}>
                    {'⚠'} Trait text should be bearer-agnostic — say &quot;the bearer&quot;, not the character&apos;s name.
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={e => { e.stopPropagation(); submitAdd(); }} onMouseDown={e => e.stopPropagation()}
                    disabled={!canAdd}
                    className="text-[9px] px-2 py-0.5 uppercase"
                    style={{
                      color: canAdd ? 'var(--terminal-prime)' : '#666',
                      border: '1px solid', borderColor: canAdd ? 'rgba(34,171,148,0.4)' : '#3a3a4e',
                      borderRadius: '2px',
                    }}>Add</button>
                  <button onClick={e => { e.stopPropagation(); resetAdd(); }} onMouseDown={e => e.stopPropagation()}
                    className="text-[9px] px-2 py-0.5 uppercase text-gray-500"
                    style={{ border: '1px solid #3a3a4e', borderRadius: '2px' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1 mb-3">
            {[
              { key: 'all', label: 'ALL' },
              { key: 'nectar', label: `NECTARS (${nectars.length})`, color: 'var(--krma-gold)' },
              { key: 'blossom', label: `BLOSSOMS (${blossoms.length})`, color: 'var(--terminal-prime)' },
              { key: 'thorn', label: `THORNS (${thorns.length})`, color: '#E84040' },
            ].map(f => (
              <button key={f.key} onClick={e => { e.stopPropagation(); setFilter(f.key); }} onMouseDown={e => e.stopPropagation()}
                className="px-2 py-1 text-xs transition-colors uppercase"
                style={{
                  borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '11px',
                  backgroundColor: filter === f.key ? 'var(--pillar-spirit)' : '#2a2a3e', color: filter === f.key ? (f.color || 'var(--krma-gold)') : '#888',
                  border: `1px solid ${filter === f.key ? (f.color || 'var(--krma-gold)') : '#3a3a4e'}`,
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
                    ...(trait.type === 'blossom' && trait.expiresAtCycle !== undefined ? [{ name: `Expires at cycle ${trait.expiresAtCycle}`, value: 0 }] : []),
                    ...(trait.type === 'blossom' && trait.expiresAtCycle === undefined && trait.durationCycles ? [{ name: `Duration: ${trait.durationCycles} cycles`, value: 0 }] : []),
                    ...(trait.source ? [{ name: `Source: ${trait.source}`, value: 0, source: { name: trait.source, type: trait.type, description: trait.description } }] : []),
                  ]} totalValue={0}>
                  <div className="p-2 border transition-colors cursor-pointer group" onMouseDown={e => e.stopPropagation()}
                    style={{ borderRadius: '2px', backgroundColor: ts.bg, borderColor: '#3a3a4e', borderLeftColor: ts.color, borderLeftWidth: '3px' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: ts.color }}>{ts.icon}</span>
                          <span className="text-sm font-medium" style={{ color: ts.color }}>{trait.name}</span>
                          <span className="text-[8px] px-1" style={{ backgroundColor: ts.color, color: '#1a1a2e', borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{ts.label}</span>
                          {trait.type === 'blossom' && (trait.expiresAtCycle !== undefined || trait.durationCycles) && (
                            <span className="text-[8px] px-1" style={{ color: 'var(--terminal-prime)', border: '1px solid rgba(34,171,148,0.35)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                              {trait.expiresAtCycle !== undefined ? `⏳ exp @ ${trait.expiresAtCycle}` : `⏳ ${trait.durationCycles} cyc`}
                            </span>
                          )}
                        </div>
                        {editingKey === `${trait.type}::${trait.name.toLowerCase()}` ? (
                          <div className="space-y-1 mt-1">
                            <input type="text" value={editDescription} onChange={e => setEditDescription(e.target.value)} onMouseDown={e => e.stopPropagation()}
                              placeholder="Description..."
                              className="w-full bg-transparent outline-none text-[10px] text-gray-300 px-1 py-0.5 border-b"
                              style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
                            <input type="text" value={editEffect} onChange={e => setEditEffect(e.target.value)} onMouseDown={e => e.stopPropagation()}
                              placeholder="Mechanical effect..."
                              className="w-full bg-transparent outline-none text-[10px] text-gray-300 px-1 py-0.5 border-b"
                              style={{ borderColor: '#3a3a4e', fontFamily: 'var(--font-terminal), Consolas, monospace' }} />
                            <div className="flex gap-1">
                              <button onClick={e => { e.stopPropagation(); saveEdit(trait); }} onMouseDown={e => e.stopPropagation()}
                                className="text-[9px] px-2 py-0.5 uppercase"
                                style={{ color: 'var(--terminal-prime)', border: '1px solid rgba(34,171,148,0.4)', borderRadius: '2px' }}>Save</button>
                              <button onClick={e => { e.stopPropagation(); setEditingKey(null); }} onMouseDown={e => e.stopPropagation()}
                                className="text-[9px] px-2 py-0.5 uppercase text-gray-500"
                                style={{ border: '1px solid #3a3a4e', borderRadius: '2px' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {trait.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#888' }}>{trait.description}</p>}
                            {trait.mechanicalEffect && <p className="text-[10px] mt-0.5" style={{ color: ts.color, opacity: 0.8 }}>{trait.mechanicalEffect}</p>}
                          </>
                        )}
                      </div>
                      {isEditable && editingKey !== `${trait.type}::${trait.name.toLowerCase()}` && (
                        <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          {onUpdateTrait && (
                            <button onClick={e => { e.stopPropagation(); startEdit(trait); }} onMouseDown={e => e.stopPropagation()}
                              className="text-[9px] w-4 h-4 flex items-center justify-center hover:bg-white/10"
                              style={{ color: '#888', borderRadius: '2px' }} title="Edit">{'✎'}</button>
                          )}
                          {onRemoveTrait && (
                            <button onClick={e => { e.stopPropagation(); onRemoveTrait(trait.type, trait.name); }} onMouseDown={e => e.stopPropagation()}
                              className="text-[9px] w-4 h-4 flex items-center justify-center hover:bg-red-900/30"
                              style={{ color: '#ff6b6b', borderRadius: '2px' }} title="Remove">{'×'}</button>
                          )}
                        </div>
                      )}
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
