'use client';

import React, { useState, useMemo } from 'react';
import type { GrowthCharacter } from '@/types/growth';
import { listTrainables, type TrainableItem, type Pillar } from '@/services/advancement';

interface CharacterInfo {
  id: string;
  name: string;
  data: GrowthCharacter;
}

interface RestPanelProps {
  characters: CharacterInfo[];
  campaignId: string;
  onClose: () => void;
  onRestComplete: () => void;
}

const PILLAR_COLORS: Record<Pillar, string> = {
  body: '#f7525f',
  spirit: '#582a72',
  soul: '#002f6c',
};
const PILLAR_ORDER: Pillar[] = ['body', 'spirit', 'soul'];

const pickKey = (item: { kind: string; name: string }) => `${item.kind}:${item.name.toLowerCase()}`;

export default function RestPanel({ characters, campaignId, onClose, onRestComplete }: RestPanelProps) {
  const [restType, setRestType] = useState<'short' | 'long'>('short');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(characters.map(c => c.id)));
  const [applying, setApplying] = useState(false);
  // Long-Rest advancement picks (r-2026-07-15-01): charId → set of pick keys.
  const [advPicks, setAdvPicks] = useState<Record<string, Set<string>>>({});
  const [results, setResults] = useState<Array<{
    name: string;
    applied: boolean;
    reason?: string;
    changes: Record<string, { from: number; to: number }>;
    advanced?: Array<{ kind: string; name: string; from: number; to: number; cost: number }>;
  }> | null>(null);

  const trainablesByChar = useMemo(() => {
    const map: Record<string, TrainableItem[]> = {};
    for (const c of characters) {
      try { map[c.id] = listTrainables(c.data); } catch { map[c.id] = []; }
    }
    return map;
  }, [characters]);

  const togglePick = (charId: string, item: TrainableItem) => {
    setAdvPicks(prev => {
      const next = { ...prev };
      const set = new Set(next[charId] ?? []);
      const key = pickKey(item);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      next[charId] = set;
      return next;
    });
  };

  /** Total Frequency cost of a character's current picks. */
  const pickCost = (charId: string): number => {
    const set = advPicks[charId];
    if (!set?.size) return 0;
    return (trainablesByChar[charId] ?? [])
      .filter(item => set.has(pickKey(item)))
      .reduce((sum, item) => sum + item.cost, 0);
  };

  const allSelected = selected.size === characters.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(characters.map(c => c.id)));
    }
  };

  const toggleChar = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getWarning = (char: CharacterInfo): string | null => {
    if (restType !== 'short') return null;
    if (char.data.conditions?.overwhelmed) return 'Overwhelmed';
    if ((char.data.attributes?.frequency?.current ?? 1) <= 0) return 'F=0';
    return null;
  };

  const applyRest = async () => {
    if (selected.size === 0) return;
    setApplying(true);
    try {
      // Build advancement picks for selected characters (long rest only).
      const picks: Record<string, Array<{ kind: string; name: string }>> = {};
      if (restType === 'long') {
        for (const charId of selected) {
          const set = advPicks[charId];
          if (!set?.size) continue;
          const items = (trainablesByChar[charId] ?? []).filter(i => set.has(pickKey(i)));
          if (items.length) picks[charId] = items.map(i => ({ kind: i.kind, name: i.name }));
        }
      }

      const res = await fetch(`/api/campaigns/${campaignId}/rest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: restType,
          characterIds: [...selected],
          ...(Object.keys(picks).length ? { picks } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
        onRestComplete();
      }
    } catch { /* silent */ }
    setApplying(false);
  };

  const TERMINAL = '#22ab94';
  const PURPLE = '#582a72';

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(10, 10, 30, 0.97) 0%, rgba(20, 15, 40, 0.97) 100%)',
        backdropFilter: 'blur(16px)',
        border: `1px solid ${TERMINAL}55`,
        borderRadius: 6,
        padding: 14,
        minWidth: 280,
        maxWidth: 340,
        fontFamily: 'var(--font-terminal), Consolas, monospace',
        color: '#F5F4EF',
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${TERMINAL}22`,
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: TERMINAL }}>
          REST
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%',
            width: 36,
            height: 36,
            cursor: 'pointer',
            color: '#F5F4EF',
            fontSize: 24,
            lineHeight: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {'\u2297'}
        </button>
      </div>

      {/* Results view */}
      {results ? (
        <div>
          <div style={{ fontSize: 11, marginBottom: 8, color: TERMINAL, fontWeight: 600 }}>
            {restType === 'short' ? 'SHORT' : 'LONG'} REST COMPLETE
          </div>
          {results.map((r, i) => (
            <div key={i} style={{
              padding: '4px 6px',
              marginBottom: 3,
              borderRadius: 4,
              background: r.applied ? 'rgba(34,171,148,0.1)' : 'rgba(232,88,90,0.1)',
              border: `1px solid ${r.applied ? TERMINAL + '33' : '#E8585A33'}`,
              fontSize: 10,
            }}>
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              {r.applied ? (
                <>
                  <span style={{ color: TERMINAL, marginLeft: 6 }}>
                    {Object.entries(r.changes).filter(([, v]) => v.from !== v.to).map(([attr, v]) =>
                      `${attr}: ${v.from}\u2192${v.to}`
                    ).join(', ') || 'no change'}
                  </span>
                  {r.advanced && r.advanced.length > 0 && (
                    <div style={{ color: '#ffcc78', marginTop: 2 }}>
                      {'\u25b2 '}{r.advanced.map(a => `${a.name} ${a.from}\u2192${a.to}`).join(', ')}
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: '#E8585A', marginLeft: 6 }}>{r.reason}</span>
              )}
            </div>
          ))}
          <button
            onClick={onClose}
            style={{
              marginTop: 8,
              width: '100%',
              padding: '6px',
              background: `${TERMINAL}22`,
              border: `1px solid ${TERMINAL}44`,
              borderRadius: 4,
              color: TERMINAL,
              fontSize: 10,
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: '0.08em',
            }}
          >
            CLOSE
          </button>
        </div>
      ) : (
        <>
          {/* Rest type toggle */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {(['short', 'long'] as const).map(t => (
              <button
                key={t}
                onClick={() => setRestType(t)}
                style={{
                  flex: 1,
                  padding: '5px 8px',
                  background: restType === t ? `${PURPLE}88` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${restType === t ? PURPLE : 'rgba(255,255,255,0.15)'}`,
                  borderRadius: 4,
                  color: restType === t ? '#F5F4EF' : 'rgba(255,255,255,0.5)',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                }}
              >
                {t === 'short' ? 'SHORT REST' : 'LONG REST'}
              </button>
            ))}
          </div>

          {/* Description */}
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 8, lineHeight: 1.4 }}>
            {restType === 'short'
              ? 'Spend 1 Frequency \u2192 restore 1 point to every other attribute pool.'
              : 'Full refill of all attribute pools to max. Clears all conditions.'}
          </div>

          {/* Select all */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <button
              onClick={toggleAll}
              style={{
                background: 'none',
                border: `1px solid ${allSelected ? TERMINAL : 'rgba(255,255,255,0.3)'}`,
                borderRadius: 3,
                width: 14,
                height: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
            >
              {allSelected && <span style={{ color: TERMINAL, fontSize: 10, lineHeight: 1 }}>{'\u2713'}</span>}
            </button>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
          </div>

          {/* Character list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
            {characters.map(char => {
              const warning = getWarning(char);
              const isSelected = selected.has(char.id);
              const freq = char.data.attributes?.frequency;
              const trainables = trainablesByChar[char.id] ?? [];
              const showPicker = restType === 'long' && isSelected && trainables.length > 0;
              const cost = pickCost(char.id);
              const maxFreq = freq?.level ?? 0;
              const picked = advPicks[char.id];

              return (
                <div key={char.id}>
                  <div
                    onClick={() => toggleChar(char.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '5px 6px',
                      borderRadius: 4,
                      background: isSelected ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: `1px solid ${isSelected ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
                      cursor: 'pointer',
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        border: `1px solid ${isSelected ? TERMINAL : 'rgba(255,255,255,0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {isSelected && <span style={{ color: TERMINAL, fontSize: 10, lineHeight: 1 }}>{'\u2713'}</span>}
                    </div>

                    {/* Name */}
                    <span style={{ fontSize: 11, flex: 1, fontWeight: 500 }}>{char.name}</span>

                    {/* Frequency indicator */}
                    {freq && restType === 'short' && (
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                        F:{freq.current}/{freq.level}
                      </span>
                    )}

                    {/* Long-rest Frequency budget after picks */}
                    {freq && restType === 'long' && cost > 0 && (
                      <span style={{ fontSize: 9, color: '#ffcc78' }}>
                        F max {maxFreq}{'\u2192'}{maxFreq - cost}
                      </span>
                    )}

                    {/* Warning */}
                    {warning && (
                      <span style={{
                        fontSize: 8,
                        padding: '1px 4px',
                        borderRadius: 3,
                        background: '#E8585A22',
                        color: '#E8585A',
                        fontWeight: 600,
                      }}>
                        {warning}
                      </span>
                    )}
                  </div>

                  {/* Trainable upgrade picker (Long Rest, r-2026-07-15-01) */}
                  {showPicker && (
                    <div style={{
                      marginLeft: 22,
                      marginTop: 2,
                      padding: '4px 6px',
                      borderLeft: '2px solid rgba(255,204,120,0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}>
                      <div style={{ fontSize: 8, color: 'rgba(255,204,120,0.7)', letterSpacing: '0.08em', fontWeight: 600 }}>
                        TRAINABLE {'\u2014'} pick upgrades (spends max Frequency)
                      </div>
                      {[...PILLAR_ORDER, 'magic' as const, 'other' as const].map(pillar => {
                        const items = pillar === 'magic'
                          ? trainables.filter(t => t.kind === 'school')
                          : pillar === 'other'
                            ? trainables.filter(t => t.pillars.length === 0 && t.kind !== 'school')
                            : trainables.filter(t => t.pillars.includes(pillar));
                        if (!items.length) return null;
                        return (
                          <div key={pillar}>
                            <div style={{ fontSize: 8, color: pillar === 'other' ? 'rgba(255,255,255,0.5)' : pillar === 'magic' ? '#b08fd9' : (PILLAR_COLORS[pillar] === '#002f6c' ? '#5b8fd9' : PILLAR_COLORS[pillar]), fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 1 }}>
                              {pillar}
                            </div>
                            {items.map(item => {
                              const key = pickKey(item);
                              const isPicked = picked?.has(key) ?? false;
                              // Budget guard: adding this pick must keep max Freq \u2265 1.
                              const wouldExceed = !isPicked && maxFreq - (cost + item.cost) < 1;
                              return (
                                <div
                                  key={key}
                                  onClick={e => { e.stopPropagation(); if (!wouldExceed) togglePick(char.id, item); }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '2px 4px',
                                    borderRadius: 3,
                                    cursor: wouldExceed ? 'default' : 'pointer',
                                    opacity: wouldExceed ? 0.35 : 1,
                                    background: isPicked ? 'rgba(255,204,120,0.1)' : 'transparent',
                                  }}
                                >
                                  <div style={{
                                    width: 11,
                                    height: 11,
                                    borderRadius: 2,
                                    border: `1px solid ${isPicked ? '#ffcc78' : 'rgba(255,255,255,0.3)'}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                  }}>
                                    {isPicked && <span style={{ color: '#ffcc78', fontSize: 8, lineHeight: 1 }}>{'\u2713'}</span>}
                                  </div>
                                  <span style={{ fontSize: 10, flex: 1 }}>{item.name}{item.kind === 'school' && item.magicPillar ? ` (${item.magicPillar})` : ''}</span>
                                  <span style={{ fontSize: 9, color: isPicked ? '#ffcc78' : 'rgba(255,255,255,0.4)' }}>
                                    {item.currentLevel}{'\u2192'}{item.currentLevel + 1}
                                  </span>
                                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.35)' }}>
                                    {'\u2212'}{item.cost}F
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Apply button */}
          <button
            onClick={applyRest}
            disabled={applying || selected.size === 0}
            style={{
              width: '100%',
              padding: '7px',
              background: selected.size === 0
                ? 'rgba(255,255,255,0.05)'
                : `linear-gradient(135deg, ${TERMINAL}cc 0%, ${TERMINAL}88 100%)`,
              border: `1px solid ${selected.size === 0 ? 'rgba(255,255,255,0.1)' : TERMINAL}`,
              borderRadius: 4,
              color: selected.size === 0 ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: 11,
              fontWeight: 700,
              cursor: selected.size === 0 ? 'default' : 'pointer',
              letterSpacing: '0.08em',
              opacity: applying ? 0.6 : 1,
            }}
          >
            {applying ? 'APPLYING...' : `GRANT ${restType.toUpperCase()} REST (${selected.size})`}
          </button>
        </>
      )}
    </div>
  );
}
