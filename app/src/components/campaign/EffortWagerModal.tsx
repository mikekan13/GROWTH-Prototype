/**
 * Effort Wager Modal — Player wagers effort after seeing the SD result.
 *
 * Appears when the server broadcasts an effort_wager_prompt via SSE.
 * Shows: SD result, difficulty color hint, available governor pools,
 * max useful effort. Player adjusts wagers and submits.
 */

'use client';

import React, { useState, useMemo } from 'react';
import type { EffortWagerPromptEvent } from '@/types/campaign-events';

interface EffortWagerModalProps {
  prompt: EffortWagerPromptEvent;
  campaignId: string;
  /** Called when player commits — passes wager data, SD die type, and cursor position for canvas die spawn */
  onComplete: (wagers: Array<{ governor: string; amount: number }>, sdDie: string, screenX: number, screenY: number) => void;
  onError?: (error: string) => void;
}

const HINT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  blue: { bg: '#1a3a5c', text: '#4da6ff', label: 'FAVORABLE' },
  purple: { bg: '#3a1a5c', text: '#b366ff', label: 'MODERATE' },
  red: { bg: '#5c1a1a', text: '#ff6666', label: 'PERILOUS' },
};

/** SVG die shapes matching the physical die geometry */
function DieShape({ die, color, size = 64 }: { die: string; color: string; size?: number }) {
  const label = die.startsWith('flat') ? `+${die.split(':')[1]}` : die.toUpperCase();

  // Die-specific shapes
  const shapes: Record<string, React.ReactElement> = {
    d4: ( // Triangle
      <polygon points={`${size/2},${size*0.1} ${size*0.9},${size*0.85} ${size*0.1},${size*0.85}`}
        fill="none" stroke={color} strokeWidth="2" />
    ),
    d6: ( // Square
      <rect x={size*0.15} y={size*0.15} width={size*0.7} height={size*0.7}
        fill="none" stroke={color} strokeWidth="2" rx="3" />
    ),
    d8: ( // Diamond
      <polygon points={`${size/2},${size*0.08} ${size*0.92},${size/2} ${size/2},${size*0.92} ${size*0.08},${size/2}`}
        fill="none" stroke={color} strokeWidth="2" />
    ),
    d12: ( // Pentagon
      <polygon points={(() => {
        const cx = size/2, cy = size/2, r = size*0.42;
        return Array.from({length: 5}, (_, i) => {
          const a = (i * 2 * Math.PI / 5) - Math.PI/2;
          return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        }).join(' ');
      })()}
        fill="none" stroke={color} strokeWidth="2" />
    ),
    d20: ( // Hexagon
      <polygon points={(() => {
        const cx = size/2, cy = size/2, r = size*0.42;
        return Array.from({length: 6}, (_, i) => {
          const a = (i * 2 * Math.PI / 6) - Math.PI/6;
          return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        }).join(' ');
      })()}
        fill="none" stroke={color} strokeWidth="2" />
    ),
  };

  const dieKey = die.startsWith('flat') ? 'flat' : die;
  const shape = shapes[dieKey];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {shape || <rect x={size*0.15} y={size*0.15} width={size*0.7} height={size*0.7} fill="none" stroke={color} strokeWidth="2" rx="3" />}
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontFamily="Bebas Neue, sans-serif" fontSize={size*0.35} fontWeight="bold">
        {label}
      </text>
    </svg>
  );
}

export default function EffortWagerModal({ prompt, campaignId, onComplete, onError }: EffortWagerModalProps) {
  const [wagers, setWagers] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const gov of prompt.availableGovernors) {
      initial[gov.name] = 0;
    }
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);

  const totalEffort = useMemo(() =>
    Object.values(wagers).reduce((sum, v) => sum + v, 0),
    [wagers]
  );

  // Outcome range — SD is known, FD range is 1 to fdMax
  const rawMin = prompt.sdResult + 1 + totalEffort;
  const rawMax = prompt.sdResult + prompt.fdMax + totalEffort;
  const possibleMax = Math.min(rawMax, prompt.maxPossible);
  const possibleMin = Math.min(rawMin, possibleMax);

  const hint = HINT_COLORS[prompt.difficultyHint] || HINT_COLORS.purple;

  // Effort ceiling: maxPossible (FD Max + Skill Level) minus what's already accounted for
  // SD is already rolled, FD will roll at least 1, so max useful effort is:
  // ceiling - sdResult - 1 (guaranteed FD minimum)
  const effortCeiling = Math.max(0, prompt.maxPossible - prompt.sdResult - 1);

  const handleWagerChange = (governor: string, value: number) => {
    const gov = prompt.availableGovernors.find(g => g.name === governor);
    if (!gov) return;
    // Clamp to pool AND ceiling
    const otherEffort = Object.entries(wagers)
      .filter(([k]) => k !== governor)
      .reduce((sum, [, v]) => sum + v, 0);
    const maxForThis = Math.min(gov.current, effortCeiling - otherEffort);
    const clamped = Math.max(0, Math.min(value, maxForThis));
    setWagers(prev => ({ ...prev, [governor]: clamped }));
  };

  const handleRoll = (e: React.MouseEvent) => {
    if (submitting) return;
    setSubmitting(true);
    const wagerList = Object.entries(wagers)
      .filter(([, amount]) => amount > 0)
      .map(([governor, amount]) => ({ governor, amount }));
    // Pass wager data + die type + cursor position to canvas
    onComplete(wagerList, prompt.sdDie, e.clientX, e.clientY);
  };

  const sdLabel = prompt.sdDie.startsWith('flat')
    ? `+${prompt.sdResult}`
    : `${prompt.sdDie.toUpperCase()} → ${prompt.sdResult}`;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-[420px] border-2 p-0 overflow-hidden" style={{
        backgroundColor: '#0a0a1a',
        borderColor: hint.text,
        boxShadow: `0 0 30px ${hint.text}40`,
      }}>
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between" style={{ backgroundColor: hint.bg }}>
          <div>
            <div className="text-xs tracking-[0.3em] uppercase" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: hint.text,
            }}>
              SKILL CHECK
            </div>
            <div className="text-[10px] tracking-[0.2em] uppercase mt-0.5" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: `${hint.text}80`,
            }}>
              {hint.label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs" style={{ color: '#888', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
              SKILL DIE
            </div>
            <div className="text-lg font-bold" style={{
              fontFamily: 'var(--font-header), Bebas Neue, sans-serif',
              color: '#fff',
            }}>
              {sdLabel}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Skill name + level */}
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-sm uppercase tracking-wider" style={{
              fontFamily: 'var(--font-header), Bebas Neue, sans-serif',
              color: '#fff',
            }}>
              {prompt.skillName || 'Unskilled Check'}
            </span>
            {prompt.skillLevel > 0 && (
              <span className="text-xs" style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                color: '#aaa',
              }}>
                Lvl {prompt.skillLevel}
              </span>
            )}
          </div>

          <div className="text-[10px] tracking-[0.2em] uppercase mb-2" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            color: '#666',
          }}>
            WAGER EFFORT
          </div>

          {prompt.availableGovernors.every(g => g.current === 0) ? (
            <div className="text-xs px-2 py-2 text-center" style={{
              color: '#ff6666',
              backgroundColor: '#ff666610',
              fontFamily: 'var(--font-terminal), Consolas, monospace',
            }}>
              ALL GOVERNOR POOLS DEPLETED — NO EFFORT AVAILABLE
            </div>
          ) : prompt.availableGovernors.map(gov => (
            <div key={gov.name} className="flex items-center gap-3">
              <div className="w-24 text-xs uppercase tracking-wider" style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                color: gov.current === 0 ? '#ff666680' : '#aaa',
              }}>
                {gov.name}
              </div>
              {gov.current === 0 ? (
                <div className="flex-1 flex items-center justify-between">
                  <span className="text-[10px]" style={{ color: '#ff666660', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                    DEPLETED
                  </span>
                  <span className="text-sm" style={{ fontFamily: 'var(--font-header), Bebas Neue, sans-serif', color: '#ff666640' }}>
                    0
                  </span>
                </div>
              ) : (
                <>
                  <input
                    type="range"
                    min={0}
                    max={gov.current}
                    value={wagers[gov.name] || 0}
                    onChange={e => handleWagerChange(gov.name, parseInt(e.target.value))}
                    className="flex-1 h-1 appearance-none rounded"
                    style={{
                      background: `linear-gradient(to right, ${hint.text} ${(wagers[gov.name] || 0) / gov.current * 100}%, #333 0%)`,
                      accentColor: hint.text,
                    }}
                  />
                  <div className="w-16 text-right text-sm" style={{
                    fontFamily: 'var(--font-header), Bebas Neue, sans-serif',
                    color: (wagers[gov.name] || 0) > 0 ? hint.text : '#555',
                  }}>
                    {wagers[gov.name] || 0} / {gov.current}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Outcome Range */}
          <div className="mt-4 pt-3 border-t space-y-2" style={{ borderColor: '#333' }}>
            {/* SD info */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                FATE DIE: {prompt.fateDie.toUpperCase()} (1–{prompt.fdMax})
              </span>
              <span className="text-[10px]" style={{ color: '#666', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                EFFORT: +{totalEffort}
              </span>
            </div>
            {/* Outcome range — just shows what the player could achieve */}
            <div className="flex items-center justify-between px-2 py-1.5" style={{
              backgroundColor: `${hint.text}10`,
              border: `1px solid ${hint.text}30`,
            }}>
              <span className="text-xs font-bold" style={{
                fontFamily: 'var(--font-header), Bebas Neue, sans-serif',
                color: '#fff',
              }}>
                POSSIBLE TOTAL: {possibleMin === possibleMax ? possibleMin : `${possibleMin} — ${possibleMax}`}
              </span>
              <span className="text-[10px] uppercase" style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                color: `${hint.text}80`,
              }}>
                CEILING: {prompt.maxPossible}
              </span>
            </div>
          </div>
        </div>

        {/* Roll Die — mousedown triggers the roll */}
        <div className="px-5 py-4 flex items-center justify-center" style={{ backgroundColor: '#111' }}>
          <div
            onMouseDown={(e) => { e.preventDefault(); handleRoll(e); }}
            className="group flex flex-col items-center gap-2 cursor-grab active:cursor-grabbing select-none"
            style={{ opacity: submitting ? 0.5 : 1 }}
            title="Grab and throw your Fate Die"
          >
            <div className="transition-transform group-hover:scale-110 group-hover:rotate-12 group-active:scale-95">
              <DieShape die={prompt.fateDie} color={hint.text} size={72} />
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] group-hover:text-white transition-colors" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: '#666',
            }}>
              {submitting ? 'ROLLING...' : 'THROW FATE DIE'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
