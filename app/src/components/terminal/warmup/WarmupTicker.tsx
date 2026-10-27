'use client';

/**
 * The speak bar's place while the pod warms (Mike 2026-10-26): locked — no typing. A black bar that ALTERNATES
 * every few seconds between
 *   (a) a random tidbit about GROWTH / the campaign from the viewer's perspective
 *       (GET /api/campaigns/[id]/tidbits?viewer=<characterId|watcher>, derived from data), and
 *   (b) "PATTERN STABILITY": the left number climbs −100 → 0, the right falls +100 → 0, and the bar between them
 *       shrinks from both ends toward the centre, no swing, until nothing is left (at full load).
 * An unreachable core is stated plainly (the old overlay's "offline" case) with the way out.
 */
import React, { useEffect, useRef, useState } from 'react';
import { patternStability, halfSpan } from './lane-progress';

const MONO = 'var(--font-terminal), Consolas, monospace';
/** Dwell times: a tidbit stays long enough to read; the readout is a glance. */
const TIDBIT_MS = 7000;
const READOUT_MS = 4000;

interface Props {
  campaignId: string;
  /** 'watcher' or a character id. */
  viewer: string;
  progress: number;
  offline: boolean;
  gpu?: string | null;
}

export default function WarmupTicker({ campaignId, viewer, progress, offline, gpu }: Props) {
  const [tidbits, setTidbits] = useState<string[]>([]);
  const [mode, setMode] = useState<'tidbit' | 'readout'>('tidbit');
  const [idx, setIdx] = useState(0);
  const pRef = useRef(progress);
  pRef.current = progress;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/tidbits?viewer=${encodeURIComponent(viewer)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { tidbits?: string[] };
        if (!cancelled && Array.isArray(data.tidbits)) { setTidbits(data.tidbits); setIdx(Math.floor(Math.random() * Math.max(1, data.tidbits.length))); }
      } catch { /* the readout alone is fine */ }
    })();
    return () => { cancelled = true; };
  }, [campaignId, viewer]);

  // Alternate: tidbit → readout → tidbit (a new random one).
  useEffect(() => {
    const t = setTimeout(() => {
      if (mode === 'tidbit') setMode('readout');
      else { setMode('tidbit'); setIdx((i) => (tidbits.length > 1 ? (i + 1 + Math.floor(Math.random() * (tidbits.length - 1))) % tidbits.length : 0)); }
    }, mode === 'tidbit' && tidbits.length > 0 ? TIDBIT_MS : READOUT_MS);
    return () => clearTimeout(t);
  }, [mode, tidbits.length]);

  const s = patternStability(progress);
  const half = halfSpan(progress);
  const showTidbit = mode === 'tidbit' && tidbits.length > 0 && !offline;

  const numStyle: React.CSSProperties = { flex: 'none', minWidth: 48, fontVariantNumeric: 'tabular-nums', fontSize: 15 };

  return (
    <div
      data-warmup-ticker
      data-locked="1"
      role="status"
      aria-live="polite"
      aria-label="The table is loading; typing is locked"
      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '0 14px', background: '#000', color: '#fff', fontFamily: MONO, fontSize: 14 }}
    >
      {/* The two numbers hold the far edges and never leave; only the glitch-out removes the whole ticker. */}
      <span data-ps-left style={{ ...numStyle, textAlign: 'left' }}>{s.left}</span>
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        {offline ? (
          <div style={{ fontSize: 13, lineHeight: 1.45 }}>
            <strong style={{ color: '#f7525f' }}>THE CORE IS UNREACHABLE.</strong>{' '}
            The lane did not answer{gpu ? ` (last seen on ${gpu})` : ''}.
          </div>
        ) : showTidbit ? (
          <div key={idx} style={{ lineHeight: 1.45, animation: 'ws-tidbit .6s ease-out' }}>{tidbits[idx % tidbits.length]}</div>
        ) : (
          // -40  ====[PATTERN STABILITY]====  40 — the label splits the bar; each half is anchored at the label and shrinks toward it.
          <div data-pattern-stability style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end' }}>
              <div data-ps-half="left" style={{ width: `${half}%`, overflow: 'hidden', whiteSpace: 'nowrap', textAlign: 'right', direction: 'rtl' }}>{'='.repeat(160)}</div>
            </div>
            <span style={{ flex: 'none', whiteSpace: 'nowrap', letterSpacing: '0.04em' }}>[PATTERN STABILITY]</span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>
              <div data-ps-half="right" style={{ width: `${half}%`, overflow: 'hidden', whiteSpace: 'nowrap' }}>{'='.repeat(160)}</div>
            </div>
          </div>
        )}
      </div>
      <span data-ps-right style={{ ...numStyle, textAlign: 'right' }}>{s.right > 0 ? `+${s.right}` : '0'}</span>
      <style>{'@keyframes ws-tidbit{from{opacity:0}to{opacity:1}}'}</style>
    </div>
  );
}
