'use client';

/**
 * Level switcher (Mike 2026-10-16: "then we just need verticality too…
 * stories and such"). One story at a time. Compact pill at the TOP-left (the
 * bottom is the Terminal drawer / JEWL chip's — Mike 2026-11-02, phone): shows
 * the current level, tap to open a menu. Levels are named by what is on them
 * (the top-level places drawn there), falling back to the raw level.
 */
import React, { useState } from 'react';
import { levelLabel } from '@/lib/canvas-geometry';

interface LevelSwitcherProps {
  /** Levels present, highest first. */
  levels: number[];
  /** null = ALL. */
  active: number | null;
  onChange: (level: number | null) => void;
  /** Top-level place names per level. */
  names?: Record<number, string[]>;
}

const GOLD = '#D0A030';
const HEADER = 'var(--font-header), "Bebas Neue", sans-serif';

function rawName(l: number): string {
  return l === 0 ? 'Ground' : l > 0 ? `Level ${l}` : `Below ${-l}`;
}

export default function LevelSwitcher({ levels, active, onChange, names }: LevelSwitcherProps) {
  const [open, setOpen] = useState(false);
  if (levels.length === 0) return null;
  const nameOf = (l: number) => {
    const n = names?.[l];
    return n && n.length ? n.join(' / ') : rawName(l);
  };
  const current = active === null ? 'All levels' : nameOf(active);
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() };
  const item = (key: string, text: string, sub: string, value: number | null) => {
    const on = active === value;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={on}
        data-level-switch={key}
        onClick={(e) => { e.stopPropagation(); onChange(value); setOpen(false); }}
        {...stop}
        style={{
          display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', minHeight: 40,
          padding: '6px 10px', textAlign: 'left',
          background: on ? GOLD : 'transparent', color: on ? '#0a0a0a' : GOLD,
          border: 'none', borderTop: `1px solid rgba(208,160,48,0.25)`,
          fontFamily: HEADER, fontSize: 15, letterSpacing: '0.06em',
          cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        <span style={{ opacity: 0.75, minWidth: 24 }}>{sub}</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
      </button>
    );
  };
  return (
    <div
      data-level-switcher
      style={{
        position: 'absolute', left: 12, top: 12, zIndex: 60,
        maxWidth: 'min(260px, calc(100vw - 24px))',
        background: 'linear-gradient(135deg, rgba(10,10,10,0.97) 0%, rgba(26,26,26,0.97) 100%)',
        border: `1px solid ${GOLD}`, borderRadius: 2,
        boxShadow: '0 4px 18px rgba(34, 171, 148, 0.2)',
        pointerEvents: 'auto', userSelect: 'none',
      }}
    >
      <button
        type="button"
        data-level-toggle
        aria-expanded={open}
        title="Choose map level"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        {...stop}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', height: 32, padding: '0 10px',
          background: 'transparent', color: GOLD, border: 'none',
          fontFamily: HEADER, fontSize: 14, letterSpacing: '0.08em',
          cursor: 'pointer', touchAction: 'manipulation',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
          {item('ALL', 'All levels', '', null)}
          {levels.map(l => item(levelLabel(l), nameOf(l), levelLabel(l), l))}
        </div>
      )}
    </div>
  );
}
