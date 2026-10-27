"use client";

/**
 * JewlInterruptPopup — JEWL's stop, in the right-click menu's own skin, force-opened (Mike 2026-10-26: "his
 * interruptions should be the same popup menu that right click brings up. It should force open and you can just
 * answer him there."). Black panel, ^v^v border, scanlines, Inknut title (CtxMenuPanel). Escape does nothing and
 * there is no backdrop dismiss: it closes only on an answer. Portalled to <body> so no panel layout, and no phone
 * sheet, can hide it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CtxMenuPanel, CtxMenuStreamLabel } from '@/components/ui/ContextMenu';
import type { JewlTicket } from './useJewlHeld';

export default function JewlInterruptPopup({ ticket, answering, onAnswer }: {
  ticket: JewlTicket;
  answering: boolean;
  onAnswer: (action: 'confirm' | 'dismiss', words: string) => void;
}) {
  const [words, setWords] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Force-open: Escape is swallowed before any other handler (dialogs, canvas, JEWL window) can act on it.
  useEffect(() => {
    const swallow = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); } };
    window.addEventListener('keydown', swallow, true);
    return () => window.removeEventListener('keydown', swallow, true);
  }, []);
  useEffect(() => { setWords(''); areaRef.current?.focus(); }, [ticket.id]);

  if (typeof document === 'undefined') return null;
  const mono = 'var(--font-terminal), Consolas, monospace';
  const btn: React.CSSProperties = { fontFamily: mono, fontSize: 13, color: '#fff', background: 'none', border: '1px solid #444', padding: '8px 12px', cursor: 'pointer', minHeight: 40, flex: 1 };

  return createPortal(
    <div
      data-jewl-popup
      role="dialog"
      aria-modal="true"
      aria-label="JEWL stopped the table"
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
    >
      <div style={{ width: 'min(100%, 460px)', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <CtxMenuStreamLabel />
        <CtxMenuPanel title="JEWL stopped the table">
          <div style={{ padding: '10px 12px 6px', fontFamily: mono, color: '#fff', fontSize: 13, lineHeight: 1.5, overflowY: 'auto', maxHeight: '70vh' }}>
            <p style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{ticket.question}</p>
            {ticket.plan.length > 0 && (
              <p style={{ margin: '0 0 8px', color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                {ticket.plan.map((p) => (p.matchId ? `${p.name} → ${p.matchName} (already here)` : `${p.name} → new ${p.kind}`)).join(' · ')}
                {ticket.estimateKrma > 0 && ` · hold ${ticket.estimateKrma} of ${ticket.fluidKrma} fluid KRMA`}
              </p>
            )}
            <p style={{ margin: '0 0 8px', color: 'rgba(255,255,255,0.45)', fontSize: 11, whiteSpace: 'pre-wrap' }}>your line: {ticket.message}</p>
            <textarea
              ref={areaRef}
              value={words}
              rows={3}
              maxLength={600}
              onChange={(e) => setWords(e.target.value)}
              placeholder="Answer him in words (optional) — what it says, what it is…"
              disabled={answering}
              // 16px: anything smaller makes iOS zoom the page when the Watcher taps in.
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: mono, fontSize: 16, lineHeight: 1.4, color: '#fff', background: '#111', border: '1px solid #444', padding: '6px 8px', outline: 0 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '6px 12px 10px' }}>
            <button className="hover:bg-white/10" style={btn} disabled={answering} onClick={() => onAnswer('confirm', words)} title="We're going somewhere new — send the line on">
              {answering ? '…' : 'continue'}
            </button>
            <button className="hover:bg-white/10" style={btn} disabled={answering} onClick={() => onAnswer('dismiss', words)} title="My mistake — take it back, the words return to the box">
              take it back
            </button>
          </div>
        </CtxMenuPanel>
      </div>
    </div>,
    document.body,
  );
}
