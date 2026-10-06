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
 */

interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

const EMPTY: HistoryState = { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null };

export function CanvasHistoryControls({ className }: { className?: string }) {
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
    minWidth: 44,
    minHeight: 32,
    padding: '0 10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    background: 'transparent',
    border: '1px solid rgba(34,171,148,0.4)',
    color: enabled ? 'var(--accent-teal, #22ab94)' : 'rgba(34,171,148,0.3)',
    fontFamily: 'var(--font-terminal), Consolas, monospace',
    fontSize: 14,
    letterSpacing: '0.08em',
    cursor: enabled ? 'pointer' : 'default',
    opacity: enabled ? 1 : 0.6,
    transition: 'color 120ms, background 120ms',
    touchAction: 'manipulation',
  });

  return (
    <div
      className={className}
      style={{ display: 'inline-flex', alignItems: 'stretch' }}
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
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>{'↶'}</span>
        <span className="hidden md:inline" style={{ textTransform: 'uppercase', fontSize: 11 }}>
          {h.canUndo && h.undoLabel ? h.undoLabel : 'undo'}
        </span>
      </button>
      <button
        type="button"
        onClick={fire('growth:canvas-redo')}
        disabled={!h.canRedo}
        aria-label={h.redoLabel ? `Redo ${h.redoLabel}` : 'Redo'}
        title={h.redoLabel ? `Redo ${h.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}
        style={{ ...btn(h.canRedo), borderLeft: 'none' }}
      >
        <span className="hidden md:inline" style={{ textTransform: 'uppercase', fontSize: 11 }}>
          {h.canRedo && h.redoLabel ? h.redoLabel : 'redo'}
        </span>
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>{'↷'}</span>
      </button>
    </div>
  );
}

export default CanvasHistoryControls;
