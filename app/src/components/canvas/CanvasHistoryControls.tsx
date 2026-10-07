'use client';

import React, { useEffect, useState } from 'react';

/**
 * Undo / redo for planning-layer canvas changes (Mike 2026-10-06).
 *
 * The engine lives in RelationsCanvas (interaction lane). Contract:
 *   - it broadcasts `growth:canvas-history` once on mount and after every change,
 *     detail = { canUndo, canRedo, undoLabel, redoLabel } (labels: 'move',
 *     'move place', 'resize', 'carry' …);
 *   - the chrome dispatches `growth:canvas-undo` / `growth:canvas-redo` to act.
 * Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y are handled by the canvas itself; these
 * buttons are the discoverable (and the only touch) path. Planning layer only:
 * ACTIVE places and anything above the line are never in the stack.
 *
 * Rendered as two icon buttons in the campaign header's order voice
 * (2026-10-07): `tone` = the ink colour for the surface they sit on
 * (soul blue on the powder tab row, powder on the soul-blue bar).
 */

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

const EMPTY: HistoryState = { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null };

const TONE = { soul: 'var(--pillar-soul, #002f6c)', powder: 'var(--surface-calm, #CBD9E8)' } as const;

export function CanvasHistoryControls({
  className,
  tone = 'soul',
  size = 40,
}: {
  className?: string;
  tone?: keyof typeof TONE;
  size?: number;
}) {
  const [h, setH] = useState<HistoryState>(EMPTY);

  useEffect(() => {
    const onHistory = (e: Event) => {
      const d = (e as CustomEvent<Partial<HistoryState>>).detail ?? {};
      setH({
        canUndo: !!d.canUndo,
        canRedo: !!d.canRedo,
        undoLabel: d.undoLabel ?? null,
        redoLabel: d.redoLabel ?? null,
      });
    };
    window.addEventListener('growth:canvas-history', onHistory);
    return () => window.removeEventListener('growth:canvas-history', onHistory);
  }, []);

  const fire = (name: 'growth:canvas-undo' | 'growth:canvas-redo') => () => {
    window.dispatchEvent(new CustomEvent(name));
  };

  const btn = (enabled: boolean): React.CSSProperties => ({
    width: size,
    height: Math.max(36, size),
    flex: 'none',
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    background: 'transparent',
    border: 0,
    color: TONE[tone],
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.35,
    transition: 'opacity 120ms',
    touchAction: 'manipulation',
  });

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', flex: 'none' }}
      role="group"
      aria-label="Canvas history"
      data-no-hold
    >
      <button
        type="button"
        onClick={fire('growth:canvas-undo')}
        disabled={!h.canUndo}
        aria-label={h.undoLabel ? `Undo ${h.undoLabel}` : 'Undo'}
        title={h.undoLabel ? `Undo ${h.undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
        style={btn(h.canUndo)}
      >
        <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </svg>
      </button>
      <button
        type="button"
        onClick={fire('growth:canvas-redo')}
        disabled={!h.canRedo}
        aria-label={h.redoLabel ? `Redo ${h.redoLabel}` : 'Redo'}
        title={h.redoLabel ? `Redo ${h.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}
        style={btn(h.canRedo)}
      >
        <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H10a6 6 0 0 0 0 12h3" />
        </svg>
      </button>
    </div>
  );
}

export default CanvasHistoryControls;
