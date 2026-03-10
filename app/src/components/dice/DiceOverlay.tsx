/**
 * Dice Canvas Layer — Renders 3D dice as physical objects on the Relations Canvas.
 *
 * No overlay, no backdrop, no result bar. Just dice sitting on the canvas.
 * Click and drag dice to fling them around. New rolls clear old dice.
 *
 * Mouse interaction: a transparent hit-test div sits on top. On mousedown,
 * raycasts into Three.js scene. If a die is hit, captures the interaction.
 * If not, temporarily disables pointer-events so the SVG canvas below gets it.
 */

'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import type { RollResult } from '@/types/dice';
import { useDiceQueue } from '@/hooks/useDiceEvents';
import { DiceAnimator } from './DiceAnimator';

const STORAGE_KEY = 'growth_dice_3d_enabled';

function is3DEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== 'false';
}

export function DiceOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitDivRef = useRef<HTMLDivElement>(null);
  const animatorRef = useRef<DiceAnimator | null>(null);
  const containerElRef = useRef<HTMLElement | null>(null);

  const [active, setActive] = useState(false);
  const [canvasBounds, setCanvasBounds] = useState<DOMRect | null>(null);

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

  // ── Clear previous dice ───────────────────────────────────────────────

  const clearDice = useCallback(() => {
    if (animatorRef.current) {
      animatorRef.current.dispose();
      animatorRef.current = null;
    }
  }, []);

  // ── Process queue ─────────────────────────────────────────────────────

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

    const container = findCanvasContainer();
    if (!container) return;

    clearDice();

    const bounds = container.getBoundingClientRect();
    setCanvasBounds(bounds);
    containerElRef.current = container;
    setActive(true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) { setActive(false); return; }

        canvas.width = bounds.width * window.devicePixelRatio;
        canvas.height = bounds.height * window.devicePixelRatio;

        const animator = new DiceAnimator(canvas, {
          onComplete: () => {},
        });

        animatorRef.current = animator;
        animator.start(result);
      });
    });
  }, [queue, dequeue, findCanvasContainer, clearDice]);

  // ── Mouse interaction: raycast-based pass-through ─────────────────────

  useEffect(() => {
    const hitDiv = hitDivRef.current;
    if (!hitDiv || !active) return;

    const onMouseDown = (e: MouseEvent) => {
      const animator = animatorRef.current;
      if (!animator || !animator.hasDice()) {
        // No dice — let event pass through
        passThrough(hitDiv, e);
        return;
      }

      // Raycast: did we hit a die?
      const captured = animator.tryGrab(e);
      if (captured) {
        // Die was grabbed — animator handles drag/fling
        e.stopPropagation();
        e.preventDefault();
      } else {
        // No die hit — pass event to SVG below
        passThrough(hitDiv, e);
      }
    };

    hitDiv.addEventListener('mousedown', onMouseDown);
    return () => hitDiv.removeEventListener('mousedown', onMouseDown);
  }, [active]);

  // ── Resize ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!active || !containerElRef.current) return;
    const handler = () => {
      const el = containerElRef.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect();
      setCanvasBounds(bounds);
      animatorRef.current?.resize(bounds.width, bounds.height);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [active]);

  // ── Cleanup ───────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (animatorRef.current) {
        animatorRef.current.dispose();
        animatorRef.current = null;
      }
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────

  if (!active || !canvasBounds) return null;

  return (
    <div
      className="fixed"
      style={{
        top: canvasBounds.top,
        left: canvasBounds.left,
        width: canvasBounds.width,
        height: canvasBounds.height,
        zIndex: 50,
        pointerEvents: 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      />

      {/* Hit-test div: intercepts mousedown, raycasts, passes through if no die */}
      <div
        ref={hitDivRef}
        className="absolute inset-0"
        style={{ pointerEvents: 'auto' }}
      />
    </div>
  );
}

/**
 * Temporarily disable pointer-events on the hit div so the same click
 * reaches the SVG canvas below, then restore on next frame.
 */
function passThrough(hitDiv: HTMLElement, originalEvent: MouseEvent): void {
  hitDiv.style.pointerEvents = 'none';

  // Find element below and dispatch a new event to it
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

  // Restore on next frame
  requestAnimationFrame(() => {
    hitDiv.style.pointerEvents = 'auto';
  });
}
