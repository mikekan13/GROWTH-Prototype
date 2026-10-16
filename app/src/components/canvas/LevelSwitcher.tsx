'use client';

/**
 * Level switcher (Mike 2026-10-16: "then we just need verticality too…
 * stories and such"). One story at a time: an elevator panel in the canvas's
 * gold-on-black Terminal language. ALL shows every level (today's canvas).
 */
import React from 'react';
import { levelLabel } from '@/lib/canvas-geometry';

interface LevelSwitcherProps {
  /** Levels present, highest first. */
  levels: number[];
  /** null = ALL. */
  active: number | null;
  onChange: (level: number | null) => void;
}

const GOLD = '#D0A030';

export default function LevelSwitcher({ levels, active, onChange }: LevelSwitcherProps) {
  if (levels.length === 0) return null;
  const btn = (label: string, value: number | null, title: string) => {
    const on = active === value;
    return (
      <button
        key={label}
        type="button"
        title={title}
        aria-pressed={on}
        data-level-switch={label}
        onClick={(e) => { e.stopPropagation(); onChange(value); }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          minWidth: 44,
          height: 36,
          padding: '0 10px',
          background: on ? GOLD : 'rgba(10,10,10,0.92)',
          color: on ? '#0a0a0a' : GOLD,
          border: `1px solid ${GOLD}`,
          borderRadius: 2,
          fontFamily: 'var(--font-header), "Bebas Neue", sans-serif',
          fontSize: 15,
          letterSpacing: '0.08em',
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      data-level-switcher
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 6,
        background: 'linear-gradient(135deg, rgba(10,10,10,0.97) 0%, rgba(26,26,26,0.97) 100%)',
        border: `1px solid ${GOLD}`,
        borderRadius: 2,
        boxShadow: '0 4px 18px rgba(34, 171, 148, 0.2)',
        pointerEvents: 'auto',
        userSelect: 'none',
      }}
    >
      <div style={{ color: GOLD, fontFamily: 'var(--font-header), "Bebas Neue", sans-serif', fontSize: 11, letterSpacing: '0.12em', textAlign: 'center', opacity: 0.85 }}>
        LEVEL
      </div>
      {btn('ALL', null, 'Every level at once')}
      {levels.map(l => btn(levelLabel(l), l, l === 0 ? 'Ground / outdoors' : l > 0 ? `Story ${l}` : `Below ground ${-l}`))}
    </div>
  );
}
