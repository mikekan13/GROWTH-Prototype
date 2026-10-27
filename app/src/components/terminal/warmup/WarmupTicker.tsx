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
import { patternStability, barSpan } from './lane-progress';

const MONO = 'var(--font-terminal), Consolas, monospace';
const TIDBIT_MS = 5200;
const READOUT_MS = 4200;

interface Props {
  campaignId: string;
  /** 'watcher' or a character id. */
  viewer: string;
  progress: number;
  offline: boolean;
  gpu?: string | null;
  onDismiss: () => void;
}

export default function WarmupTicker({ campaignId, viewer, progress, offline, gpu, onDismiss }: Props) {
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
  const { left, width } = barSpan(progress);
  const showTidbit = mode === 'tidbit' && tidbits.length > 0 && !offline;

  return (
    <div
      data-warmup-ticker
      data-locked="1"
      role="status"
      aria-live="polite"
      aria-label="The table is loading; typing is locked"
      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 56, padding: '0 14px', background: '#000', color: '#fff', fontFamily: MONO, fontSize: 14 }}
    >
      <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        {offline ? (
          <div style={{ fontSize: 13, lineHeight: 1.45 }}>
            <strong style={{ color: '#f7525f' }}>THE CORE IS UNREACHABLE.</strong>{' '}
            The lane did not answer at the network level{gpu ? ` (last seen on ${gpu})` : ''}. The table still records, but no one at it will respond.
          </div>
        ) : showTidbit ? (
          <div key={idx} style={{ lineHeight: 1.45, animation: 'ws-tidbit .6s ease-out' }}>{tidbits[idx % tidbits.length]}</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', maxWidth: 560, margin: '0 auto' }} data-pattern-stability>
            <span style={{ letterSpacing: '0.16em', fontSize: 11, whiteSpace: 'nowrap' }}>PATTERN STABILITY</span>
            <span data-ps-left style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{s.left}</span>
            <div style={{ position: 'relative', flex: 1, height: 10, borderLeft: '1px solid rgba(255,255,255,.35)', borderRight: '1px solid rgba(255,255,255,.35)' }}>
              <div style={{ position: 'absolute', top: 2, bottom: 2, left: `${left}%`, width: `${width}%`, background: '#fff' }} />
            </div>
            <span data-ps-right style={{ minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>+{s.right}</span>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        data-no-hold
        style={{ flex: 'none', minHeight: 36, padding: '0 10px', border: '1px solid rgba(255,255,255,.4)', background: 'transparent', color: '#fff', fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer' }}
        title="Stop waiting and set up the table; the first line of the night will still wait for the core"
      >
        PREPARE MEANWHILE
      </button>
      <style>{'@keyframes ws-tidbit{from{opacity:0}to{opacity:1}}'}</style>
    </div>
  );
}
