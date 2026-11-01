"use client";

/**
 * STACK PICKER (Mike 2026-11-01: "difficult to interact with Kristopher ... when
 * things are in the same space ... a stack menu so users can pick which one they
 * are trying to grab"). When a tap lands where two or more TOKENS (characters /
 * things) overlap, the canvas shows this small menu instead of acting on the top
 * one. A row TAPS = what a tap on that token alone does; a row DRAGGED past a
 * small threshold hands the gesture to that token's own drag (a synthetic
 * pointerdown on the token — same offsets, same commit as a direct drag).
 */
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CtxMenuPanel, ctxMenuStyle } from '@/components/ui/ContextMenu';

export interface StackEntry { id: string; name: string; kind: 'character' | 'thing' }

/** Every token under a client point, topmost first. Uses the browser's own hit
 *  testing (elementsFromPoint), so sizes, transforms and zoom are already right;
 *  a thing with a drawn floor shape only counts where its polygon is. */
export function tokensAtPoint(clientX: number, clientY: number, nameOf: (id: string) => string | undefined): StackEntry[] {
  if (typeof document === 'undefined') return [];
  const els = document.elementsFromPoint(clientX, clientY);
  const out: StackEntry[] = [];
  const seen = new Set<string>();
  for (const el of els) {
    const ch = el.closest('[data-character-token]');
    const it = ch ? null : el.closest('[data-item-token]');
    const tok = ch ?? it;
    if (!tok) continue;
    const id = (ch ? ch.getAttribute('data-character-token') : tok.getAttribute('data-item-token')) ?? '';
    if (!id || seen.has(id)) continue;
    if (it && it.querySelector('polygon') && !els.some(e => e.tagName.toLowerCase() === 'polygon' && it.contains(e))) continue;
    seen.add(id);
    out.push({ id, name: nameOf(id) ?? (ch ? 'Character' : 'Thing'), kind: ch ? 'character' : 'thing' });
  }
  return out;
}

const DRAG_PX = 8;

export function StackPicker({ entries, x, y, onPick, onClose }: {
  entries: StackEntry[]; x: number; y: number;
  onPick: (id: string) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useRef({ onPick, onClose });
  cb.current = { onPick, onClose };

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!e.isTrusted) return;
      if (ref.current && ref.current.contains(e.target as Node)) return;
      cb.current.onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cb.current.onClose(); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); };
  }, []);

  const rowDown = (e: React.PointerEvent, entry: StackEntry) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, pid = e.pointerId, ptype = e.pointerType;
    let done = false;
    const cleanup = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel); };
    const move = (m: PointerEvent) => {
      if (done || m.pointerId !== pid) return;
      if (Math.hypot(m.clientX - sx, m.clientY - sy) <= DRAG_PX) return;
      done = true; cleanup();
      const sel = entry.kind === 'character' ? `[data-character-token="${entry.id}"]` : `[data-item-token="${entry.id}"]`;
      const tok = document.querySelector(sel);
      cb.current.onClose();
      try {
        tok?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: sx, clientY: sy, pointerId: pid, pointerType: ptype, isPrimary: true }));
      } catch { /* PointerEvent unavailable */ }
    };
    const up = (u: PointerEvent) => {
      if (done || u.pointerId !== pid) return;
      done = true; cleanup();
      cb.current.onClose();
      cb.current.onPick(entry.id);
    };
    const cancel = (c: PointerEvent) => { if (c.pointerId === pid) { done = true; cleanup(); } };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', cancel);
  };

  if (typeof window === 'undefined') return null;
  const W = 220;
  const left = Math.max(8, Math.min(x + 6, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y + 6, window.innerHeight - (entries.length * 48 + 70) - 8));
  return createPortal(
    <div
      ref={ref}
      data-stack-picker
      className="fixed z-[110]"
      style={{ left, top, width: W, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <CtxMenuPanel title="Which one?">
        {entries.map(en => (
          <div
            key={en.id}
            role="button"
            onPointerDown={(e) => rowDown(e, en)}
            className="w-full px-3 py-1.5 text-left text-xs hover:bg-[var(--terminal-prime)]/20 font-[Consolas,monospace] cursor-pointer flex items-center justify-between gap-2 min-h-[34px] [@media(pointer:coarse)]:min-h-[46px]"
            style={{ color: '#fff', touchAction: 'none' }}
          >
            <span>{ctxMenuStyle(en.name)}</span>
            <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10 }}>{en.kind}</span>
          </div>
        ))}
      </CtxMenuPanel>
    </div>,
    document.body,
  );
}
