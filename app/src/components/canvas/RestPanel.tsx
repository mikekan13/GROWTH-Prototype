'use client';

import React, { useState } from 'react';
import type { GrowthCharacter } from '@/types/growth';

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

export default function RestPanel({ characters, campaignId, onClose, onRestComplete }: RestPanelProps) {
  const [restType, setRestType] = useState<'short' | 'long'>('short');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(characters.map(c => c.id)));
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<Array<{
    name: string;
    applied: boolean;
    reason?: string;
    changes: Record<string, { from: number; to: number }>;
  }> | null>(null);

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
      const res = await fetch(`/api/campaigns/${campaignId}/rest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: restType,
          characterIds: [...selected],
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
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: 4,
            width: 20,
            height: 20,
            cursor: 'pointer',
            color: '#F5F4EF',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &times;
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
                <span style={{ color: TERMINAL, marginLeft: 6 }}>
                  {Object.entries(r.changes).filter(([, v]) => v.from !== v.to).map(([attr, v]) =>
                    `${attr}: ${v.from}\u2192${v.to}`
                  ).join(', ') || 'no change'}
                </span>
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

              return (
                <div
                  key={char.id}
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
