/**
 * Dice Canvas Layer — Renders 3D dice as persistent physical objects on the canvas.
 *
 * Inserts itself as a child of the Relations Canvas container so dice
 * move with panning/zooming. Uses position:absolute to fill the container.
 *
 * Right-click on the canvas → context menu to spawn a die (d4-d20).
 * Right-click on a die → option to put it away.
 * Left-click on a die → grab and fling.
 *
 * The contextmenu listener is attached to the Relations Canvas container
 * directly (not the hit div) so it works even before any dice exist.
 */

'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { DieType, DieColor } from '@/types/dice';
import { useDiceQueue } from '@/hooks/useDiceEvents';
import { DiceAnimator } from './DiceAnimator';

const STORAGE_KEY = 'growth_dice_3d_enabled';

// Each die type has a canonical GROWTH pillar color
const DIE_OPTIONS: { type: DieType; label: string; color: DieColor; hex: string }[] = [
  { type: 'd4', label: 'D4', color: 'red', hex: '#E8585A' },
  { type: 'd6', label: 'D6', color: 'teal', hex: '#2DB8A0' },
  { type: 'd8', label: 'D8', color: 'blue', hex: '#4080D0' },
  { type: 'd12', label: 'D12', color: 'purple', hex: '#7050A8' },
  { type: 'd20', label: 'D20', color: 'gold', hex: '#D0A030' },
];

interface ContextMenuState {
  x: number;
  y: number;
  mode: 'spawn' | 'remove';
}

function is3DEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== 'false';
}

export function DiceOverlay() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitDivRef = useRef<HTMLDivElement>(null);
  const animatorRef = useRef<DiceAnimator | null>(null);
  const containerElRef = useRef<HTMLElement | null>(null);
  const portalMounted = useRef(false);
  const initialized = useRef(false);

  const [active, setActive] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const { queue, dequeue } = useDiceQueue();

  // ── Find the Relations Canvas container ───────────────────────────────

  const findCanvasContainer = useCallback((): HTMLElement | null => {
    const candidates = document.querySelectorAll('div.relative.overflow-hidden');
    for (const el of candidates) {
      if (el.querySelector('svg') && el.classList.contains('h-full')) {
        return el as HTMLElement;
      }
    }
    const svgs = document.querySelectorAll('svg.w-full.h-full');
    if (svgs.length > 0) return svgs[0].parentElement;
    return null;
  }, []);

  // ── Mount/unmount ────────────────────────────────────────────────────

  const mountIntoContainer = useCallback((container: HTMLElement) => {
    const wrapper = wrapperRef.current;
    if (!wrapper || portalMounted.current) return;

    const style = getComputedStyle(container);
    if (style.position === 'static') {
      container.style.position = 'relative';
    }

    container.appendChild(wrapper);
    portalMounted.current = true;
    containerElRef.current = container;
  }, []);

  const unmountFromContainer = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !portalMounted.current) return;

    try {
      wrapper.parentElement?.removeChild(wrapper);
    } catch {
      // Already removed
    }
    portalMounted.current = false;
    containerElRef.current = null;
  }, []);

  // ── Initialize the animator (once) ──────────────────────────────────

  const ensureInitialized = useCallback(() => {
    if (initialized.current && animatorRef.current) return true;

    const container = findCanvasContainer();
    if (!container) return false;

    mountIntoContainer(container);
    setActive(true);

    const canvas = canvasRef.current;
    if (!canvas) return false;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    const animator = new DiceAnimator(canvas, {
      onSettle: (_dice) => {
        // TODO: Wire settled values back to terminal/game systems
      },
    });

    animatorRef.current = animator;
    initialized.current = true;
    return true;
  }, [findCanvasContainer, mountIntoContainer]);

  // ── Process queue (from dice service rolls) ─────────────────────────

  useEffect(() => {
    if (queue.length === 0) return;

    if (!is3DEnabled()) {
      dequeue();
      return;
    }

    const result = dequeue();
    if (!result) return;

    const hasRollableDice = result.rolls.some(r => r.die !== 'flat' && r.maxValue > 0);
    if (!hasRollableDice) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!ensureInitialized()) return;
        animatorRef.current!.start(result);
      });
    });
  }, [queue, dequeue, ensureInitialized]);

  // ── Context menu handlers ───────────────────────────────────────────

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleSpawnDie = useCallback((dieType: DieType) => {
    if (!contextMenu || !animatorRef.current) return;
    const opt = DIE_OPTIONS.find(d => d.type === dieType);
    const color = opt?.color ?? 'white';
    animatorRef.current.spawnDie(dieType, color, contextMenu.x, contextMenu.y);
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  const handleRemoveDie = useCallback(() => {
    if (!contextMenu || !animatorRef.current) return;
    animatorRef.current.removeDieAt(contextMenu.x, contextMenu.y);
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  // ── Document-level contextmenu listener ─────────────────────────────
  // Attached to document in capture phase so it fires before anything else.
  // Checks if the right-click is within the Relations Canvas container.

  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      // Find the container on each right-click (handles DOM changes)
      const container = findCanvasContainer();
      if (!container) return;

      // Check if click is within the canvas container bounds
      const rect = container.getBoundingClientRect();
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom
      ) return;

      // Don't hijack right-click on card context menus (they have their own)
      const target = e.target as HTMLElement;
      if (target.closest('[data-dice-menu]')) return;

      // Must preventDefault synchronously
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      const clientX = e.clientX;
      const clientY = e.clientY;

      requestAnimationFrame(() => {
        if (!ensureInitialized()) return;

        const animator = animatorRef.current!;
        const hasDie = animator.hasDieAt(clientX, clientY);

        setContextMenu({
          x: clientX,
          y: clientY,
          mode: hasDie ? 'remove' : 'spawn',
        });
      });
    };

    document.addEventListener('contextmenu', onContextMenu, true);
    return () => document.removeEventListener('contextmenu', onContextMenu, true);
  }, [findCanvasContainer, ensureInitialized]);

  // ── Mouse interaction: left-click grab ──────────────────────────────

  useEffect(() => {
    const hitDiv = hitDivRef.current;
    if (!hitDiv || !active) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const animator = animatorRef.current;
      if (!animator || !animator.hasDice()) {
        passThrough(hitDiv, e);
        return;
      }

      const captured = animator.tryGrab(e);
      if (captured) {
        e.stopPropagation();
        e.preventDefault();
      } else {
        passThrough(hitDiv, e);
      }
    };

    // Wheel passthrough: disable pointer-events, re-dispatch the native event
    // at the element underneath so it flows through React's event system normally.
    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      hitDiv.style.pointerEvents = 'none';
      const target = document.elementFromPoint(e.clientX, e.clientY);
      hitDiv.style.pointerEvents = 'auto';
      if (target && target !== hitDiv) {
        target.dispatchEvent(new WheelEvent(e.type, e));
      }
    };

    hitDiv.addEventListener('mousedown', onMouseDown);
    hitDiv.addEventListener('wheel', onWheel);
    return () => {
      hitDiv.removeEventListener('mousedown', onMouseDown);
      hitDiv.removeEventListener('wheel', onWheel);
    };
  }, [active]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-dice-menu]')) return;
      closeContextMenu();
    };
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [contextMenu, closeContextMenu]);

  // ── Resize ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!active || !containerElRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          animatorRef.current?.resize(width, height);
        }
      }
    });

    observer.observe(containerElRef.current);
    return () => observer.disconnect();
  }, [active]);

  // ── Sync with SVG viewBox ─────────────────────────────────────────────

  useEffect(() => {
    if (!active || !containerElRef.current) return;

    const svg = containerElRef.current.querySelector('svg');
    if (!svg) return;

    const syncViewBox = () => {
      const vb = svg.viewBox?.baseVal;
      if (!vb || vb.width === 0) return;
      animatorRef.current?.syncWithViewBox(vb.x, vb.y, vb.width, vb.height);
    };

    syncViewBox();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'viewBox') {
          syncViewBox();
        }
      }
    });

    observer.observe(svg, { attributes: true, attributeFilter: ['viewBox'] });
    return () => observer.disconnect();
  }, [active]);

  // ── Cleanup ───────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (animatorRef.current) {
        animatorRef.current.dispose();
        animatorRef.current = null;
      }
      initialized.current = false;
      unmountFromContainer();
    };
  }, [unmountFromContainer]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        pointerEvents: 'none',
        display: active ? 'block' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      <div
        ref={hitDivRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: active ? 'auto' : 'none',
        }}
      />

      {contextMenu && (
        <div
          data-dice-menu
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.mode === 'remove' ? (
            <div className="bg-zinc-900 border border-zinc-700 rounded-md shadow-xl py-1 min-w-[140px]">
              <button
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700 font-[Consolas,monospace]"
                onClick={handleRemoveDie}
              >
                Put away
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-700 rounded-md shadow-xl py-1 min-w-[140px]">
              <div className="px-3 py-1 text-xs text-zinc-500 font-[Consolas,monospace] border-b border-zinc-800">
                Pull out a die
              </div>
              {DIE_OPTIONS.map(({ type, label, hex }) => (
                <button
                  key={type}
                  className="w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-700 font-[Consolas,monospace] flex items-center gap-2"
                  onClick={() => handleSpawnDie(type)}
                >
                  <span
                    className="w-3 h-3 rounded-full inline-block border border-zinc-600 flex-shrink-0"
                    style={{ backgroundColor: hex }}
                  />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function passThrough(hitDiv: HTMLElement, originalEvent: MouseEvent): void {
  hitDiv.style.pointerEvents = 'none';

  const below = document.elementFromPoint(originalEvent.clientX, originalEvent.clientY);
  if (below && below !== hitDiv) {
    below.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      clientX: originalEvent.clientX,
      clientY: originalEvent.clientY,
      button: originalEvent.button,
      buttons: originalEvent.buttons,
    }));
  }

  requestAnimationFrame(() => {
    hitDiv.style.pointerEvents = 'auto';
  });
}
