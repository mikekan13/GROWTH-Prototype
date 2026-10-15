"use client";

/**
 * Designer chrome in the rulebook's voice (intake 2026-10-06): powder-blue
 * working surface, black highlight bars behind titles and the primary action,
 * Bebas titles / Consolas chrome / Comfortaa body, no rounded corners, no
 * bordered boxes, a faint sigil chain down the left, a brief glitch when a
 * new layer lands (CSS only; off under prefers-reduced-motion).
 */

import React, { useEffect, useState } from 'react';

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

      /* The veil: a reality-layer transition while the engine works. */
      @keyframes gd-veil-split {
        0%   { transform: translate(0,0); clip-path: inset(0 0 0 0); filter: grayscale(0.6) contrast(1.2); }
        10%  { transform: translate(-6px,2px); clip-path: inset(8% 0 62% 0); filter: drop-shadow(-4px 0 ${C.body}) drop-shadow(4px 0 ${C.teal}) grayscale(0.4); }
        20%  { transform: translate(5px,-3px); clip-path: inset(40% 0 30% 0); filter: hue-rotate(60deg) saturate(1.8); }
        30%  { transform: translate(0,0); clip-path: inset(0 0 0 0); filter: grayscale(0.7) contrast(1.3); }
        42%  { transform: translate(3px,1px); clip-path: inset(70% 0 5% 0); filter: drop-shadow(3px 0 ${C.spirit}) invert(0.12); }
        55%  { transform: translate(-2px,0); clip-path: inset(0 0 0 0); filter: grayscale(0.6) contrast(1.2); }
        70%  { transform: translate(-7px,3px); clip-path: inset(22% 0 48% 0); filter: drop-shadow(-5px 0 ${C.teal}) drop-shadow(5px 0 ${C.body}); }
        82%  { transform: translate(4px,-2px); clip-path: inset(55% 0 12% 0); filter: hue-rotate(-50deg) saturate(2); }
        100% { transform: translate(0,0); clip-path: inset(0 0 0 0); filter: grayscale(0.6) contrast(1.2); }
      }
      @keyframes gd-veil-sweep {
        0%   { transform: translateY(-120%); }
        100% { transform: translateY(1200%); }
      }
      @keyframes gd-veil-flicker {
        0%, 100% { opacity: 1; }
        8%  { opacity: 0.55; }
        9%  { opacity: 1; }
        37% { opacity: 0.8; }
        38% { opacity: 1; }
        61% { opacity: 0.4; }
        63% { opacity: 1; }
      }
      @keyframes gd-veil-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
      .gd-veil-img { animation: gd-veil-split 1.9s steps(12, end) infinite; }
      .gd-veil-sweep { animation: gd-veil-sweep 2.6s linear infinite; }
      .gd-veil-flicker { animation: gd-veil-flicker 3.1s steps(1, end) infinite; }
      .gd-veil-cursor { animation: gd-veil-blink 1s steps(1, end) infinite; }
      .gd-veil-noise::after {
        content: ''; position: absolute; inset: 0; pointer-events: none;
        background: repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 2px, transparent 2px 5px);
      }

      /* Framed buttons under the preview (the canvas sheet's gold/black language). */
      .gd-frame-btn:hover:not(:disabled) { filter: drop-shadow(0 0 6px rgba(255,204,120,0.85)); }
      .gd-frame-btn:active:not(:disabled) { transform: translateY(1px); }

      @media (prefers-reduced-motion: reduce) {
        .gd-glitch, .gd-veil-img, .gd-veil-sweep, .gd-veil-flicker, .gd-veil-cursor { animation: none; }
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

/**
 * A framed button under the preview, in the canvas sheet's language: GOLD =
 * the generating action (KRMA gold gradient, ink text); INK = the black bar
 * with gold text. Renders as a link when `href` is given (full size).
 */
export function FrameButton({ label, onClick, href, tone = 'gold', disabled, busy, testId }: {
  label: string; onClick?: () => void; href?: string; tone?: 'gold' | 'ink'; disabled?: boolean; busy?: boolean; testId?: string;
}) {
  const off = disabled || busy;
  const style: React.CSSProperties = {
    minHeight: 48, flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '0 14px', textDecoration: 'none', boxSizing: 'border-box',
    fontFamily: F.bebas, fontSize: 19, letterSpacing: '0.16em', lineHeight: 1,
    cursor: off ? 'default' : 'pointer', transition: 'filter 120ms ease, transform 60ms ease',
    ...(off
      ? { background: '#5b6470', color: '#b9c9da', border: `2px solid #5b6470` }
      : tone === 'gold'
        ? { background: `linear-gradient(90deg, ${C.gold} 0%, #ffaa44 100%)`, color: C.ink, border: `2px solid ${C.ink}` }
        : { background: C.ink, color: C.gold, border: `2px solid ${C.gold}` }),
  };
  const text = busy ? `${label}…` : label;
  if (href && !off) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="gd-btn gd-frame-btn" style={style} data-testid={testId} aria-label={`${label} (opens in a new tab)`}>
        {text}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={off} className="gd-btn gd-frame-btn" style={style} data-testid={testId}>
      {text}
    </button>
  );
}

const NOISE_GLYPHS = '01░▒▓█▚▞╳⟟⌁⍉⎔☿△♀☉▽♂☽♃♄✶·  ';
function noiseLine(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += NOISE_GLYPHS[Math.floor(Math.random() * NOISE_GLYPHS.length)];
  return s;
}
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * The loading veil over the preview while the engine works: the current image
 * tears in RGB (a reality-layer glitch), a scan band sweeps, the status line
 * sits on a black bar in gold with a ticking clock and a line of noise.
 * Still (no motion, no noise churn) under prefers-reduced-motion.
 */
export function GlitchVeil({ line, src }: { line: string; src: string | null }) {
  const [noise, setNoise] = useState(() => noiseLine(28));
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = setInterval(() => {
      setSecs(Math.floor((Date.now() - start) / 1000));
      if (!still) setNoise(noiseLine(28));
    }, still ? 1000 : 110);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden gd-veil-noise" role="status" aria-live="polite" data-testid="designer-veil" style={{ background: C.ink }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" aria-hidden className="gd-veil-img absolute inset-0 w-full h-full object-contain" style={{ opacity: 0.55 }} />
      )}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(20,20,19,0.55) 0%, rgba(20,20,19,0.15) 45%, rgba(20,20,19,0.7) 100%)' }} />
      <div
        aria-hidden
        className="gd-veil-sweep absolute left-0 right-0"
        style={{ top: 0, height: '8%', background: `linear-gradient(180deg, transparent, rgba(34,171,148,0.35), rgba(255,204,120,0.45), transparent)` }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <span className="gd-veil-flicker px-3 py-1" style={{ background: C.ink, color: C.gold, fontFamily: F.bebas, fontSize: 22, letterSpacing: '0.18em', lineHeight: 1.2, boxShadow: `0 0 0 1px ${C.gold}` }}>
          {line}
        </span>
        <span aria-hidden className="px-2" style={{ background: 'rgba(20,20,19,0.85)', color: C.teal, fontFamily: F.mono, fontSize: 11, letterSpacing: '0.1em', whiteSpace: 'pre' }}>
          {noise}
        </span>
        <span className="px-2" style={{ background: 'rgba(20,20,19,0.85)', color: C.powder, fontFamily: F.mono, fontSize: 12, letterSpacing: '0.1em' }}>
          {mmss(secs)} <span className="gd-veil-cursor">█</span>
        </span>
      </div>
    </div>
  );
}

/** Ghost text button (Consolas, underlined) — "change photos" and the like. */
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
