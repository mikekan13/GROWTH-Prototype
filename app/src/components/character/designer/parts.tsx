"use client";

/**
 * Designer chrome in the rulebook's voice (intake 2026-10-06): powder-blue
 * working surface, black highlight bars behind titles and the primary action,
 * Bebas titles / Consolas chrome / Comfortaa body, no rounded corners, no
 * bordered boxes, a faint sigil chain down the left, a brief glitch when a
 * new layer lands (CSS only; off under prefers-reduced-motion).
 */

import React from 'react';

export const C = {
  powder: '#CBD9E8',
  offWhite: '#FAFAF8',
  ink: '#141413',
  soul: '#002f6c',
  spirit: '#582a72',
  teal: '#22ab94',
  gold: '#ffcc78',
  body: '#f7525f',
  sigil: '#D5DBD3',
} as const;

export const F = {
  mono: 'var(--font-terminal), Consolas, monospace',
  bebas: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
  body: 'var(--font-comfortaa), Comfortaa, sans-serif',
} as const;

/** Keyframes + reduced-motion, scoped by class names prefixed gd-. */
export function DesignerStyles() {
  return (
    <style>{`
      @keyframes gd-glitch {
        0%   { transform: translate(0,0); filter: none; clip-path: inset(0 0 0 0); }
        15%  { transform: translate(-3px,1px); filter: hue-rotate(40deg) saturate(1.6); clip-path: inset(12% 0 58% 0); }
        30%  { transform: translate(3px,-1px); filter: drop-shadow(-2px 0 ${C.body}) drop-shadow(2px 0 ${C.teal}); clip-path: inset(48% 0 20% 0); }
        45%  { transform: translate(-1px,0); filter: invert(0.08); clip-path: inset(0 0 0 0); }
        60%  { transform: translate(1px,1px); filter: drop-shadow(1px 0 ${C.spirit}); }
        100% { transform: translate(0,0); filter: none; clip-path: inset(0 0 0 0); }
      }
      .gd-glitch { animation: gd-glitch 420ms steps(6, end) 1; }
      .gd-scan::after {
        content: ''; position: absolute; inset: 0; pointer-events: none;
        background: repeating-linear-gradient(0deg, rgba(20,20,19,0.06) 0 1px, transparent 1px 3px);
      }
      @media (prefers-reduced-motion: reduce) {
        .gd-glitch { animation: none; }
      }
      .gd-input:focus { outline: 2px solid ${C.soul}; outline-offset: 0; }
      .gd-btn:focus-visible { outline: 2px solid ${C.gold}; outline-offset: 1px; }
    `}</style>
  );
}

const SIGILS = ['☿', '△', '♀', '☉', '▽', '♂', '☽', '♃', '♄', '✶', '☿', '△', '♀', '☉', '▽', '♂', '☽', '♃', '♄'];

/** Faint alchemical chain down the left margin (~18 %), decorative only. */
export function SigilBorder() {
  return (
    <div
      aria-hidden
      className="absolute left-0 top-0 bottom-0 flex flex-col items-center overflow-hidden select-none pointer-events-none"
      style={{ width: 16, paddingTop: 10, gap: 14, color: C.soul, opacity: 0.18, fontSize: 11, lineHeight: 1, borderRight: `1px solid rgba(0,47,108,0.12)` }}
    >
      {SIGILS.map((s, i) => <span key={i}>{s}</span>)}
    </div>
  );
}

/** Section title as a black tape strip (Bebas, hugs the text). */
export function SectionBar({ n, title, hint, right }: { n?: number; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-2 flex-wrap">
      <div className="min-w-0">
        <span
          className="inline-block px-2"
          style={{ background: C.ink, color: '#fff', fontFamily: F.bebas, fontSize: 20, letterSpacing: '0.1em', lineHeight: '28px' }}
        >
          {n != null ? `${n} · ` : ''}{title}
        </span>
        {hint && (
          <div className="mt-1 text-xs" style={{ fontFamily: F.mono, color: C.soul }}>{hint}</div>
        )}
      </div>
      {right}
    </div>
  );
}

/** A chip: black fill when on, ink text on powder when off. Spirit variant for JEWL / marks. */
export function Chip({ label, on, onClick, tone = 'ink', disabled, testId }: {
  label: string; on?: boolean; onClick?: () => void; tone?: 'ink' | 'spirit'; disabled?: boolean; testId?: string;
}) {
  const base = tone === 'spirit' ? C.spirit : C.ink;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      data-testid={testId}
      className="gd-btn px-3"
      style={{
        minHeight: 44, minWidth: 44,
        background: on ? base : 'transparent',
        color: on ? C.powder : base,
        border: `1px solid ${base}`,
        fontFamily: F.mono, fontSize: 12, letterSpacing: '0.04em',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

/** The primary action: a full black bar (tone: soul for Tapestry, spirit for JEWL). */
export function ActionBar({ label, onClick, disabled, busy, tone = 'ink', testId }: {
  label: string; onClick: () => void; disabled?: boolean; busy?: boolean; tone?: 'ink' | 'soul' | 'spirit'; testId?: string;
}) {
  const bg = tone === 'spirit' ? C.spirit : tone === 'soul' ? C.soul : C.ink;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      data-testid={testId}
      className="gd-btn w-full"
      style={{
        minHeight: 48, background: disabled ? '#5b6470' : bg, color: '#fff',
        fontFamily: F.bebas, fontSize: 20, letterSpacing: '0.14em', border: 'none',
        cursor: disabled || busy ? 'default' : 'pointer',
      }}
    >
      {busy ? `${label}…` : label}
    </button>
  );
}

/** Ghost text button (Consolas, underlined) — "regenerate", "change photos", "levers". */
export function GhostButton({ label, onClick, disabled, testId }: { label: string; onClick: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="gd-btn px-2"
      style={{
        minHeight: 44, background: 'transparent', border: 'none', color: disabled ? '#7a8594' : C.soul,
        fontFamily: F.mono, fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 3,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

export function TextInput({ value, onChange, placeholder, multiline, testId, onEnter, disabled }: {
  value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean; testId?: string;
  onEnter?: () => void; disabled?: boolean;
}) {
  const style: React.CSSProperties = {
    width: '100%', minHeight: 44, padding: '10px 10px', background: C.offWhite, color: C.ink,
    border: 'none', borderBottom: `2px solid ${C.ink}`, fontFamily: F.body, fontSize: 14, borderRadius: 0,
  };
  return multiline ? (
    <textarea
      className="gd-input" rows={2} value={value} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)} data-testid={testId} style={{ ...style, resize: 'vertical' }}
    />
  ) : (
    <input
      className="gd-input" value={value} placeholder={placeholder} disabled={disabled}
      onChange={e => onChange(e.target.value)} data-testid={testId} style={style}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
    />
  );
}

/** A Consolas readout line on black (status / error / levers). */
export function Readout({ children, tone = 'plain', testId }: { children: React.ReactNode; tone?: 'plain' | 'error' | 'note'; testId?: string }) {
  const color = tone === 'error' ? C.body : tone === 'note' ? C.gold : C.powder;
  return (
    <div
      role={tone === 'plain' ? undefined : 'status'}
      data-testid={testId}
      className="px-2 py-1 text-xs"
      style={{ background: C.ink, color, fontFamily: F.mono, wordBreak: 'break-word', lineHeight: 1.5 }}
    >
      {children}
    </div>
  );
}
