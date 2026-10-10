'use client';

/**
 * SPOKEN BLOCK (P2, 2026-10-06): with voice on, every completed spoken sentence
 * is declared canon and lands in the feed as its own game_event
 * ({ eventType: 'declaration', description, beatId }) — a running transcript.
 * One event per sentence is noise, so the terminal folds consecutive
 * declarations that share a beatId into ONE dimmer block: mic glyph instead of
 * an actor badge, grey-blue text, one timestamp for the block, collapsed to its
 * first sentence with "+N" until tapped. Typed prose and being lines keep full
 * weight, so the eye reads the conversation, not the transcript.
 *
 * A beat runs until the GM hands the turn over; 5 minutes of silence starts a
 * new one. Rows without a beatId are never grouped (they render as today).
 */

import React, { useState } from 'react';
import type { TerminalEvent, GameEventPayload } from '@/types/terminal';

export function isSpokenDeclaration(e: TerminalEvent): e is TerminalEvent & { payload: GameEventPayload & { beatId: string } } {
  return e.payload.kind === 'game_event' && e.payload.eventType === 'declaration' && typeof e.payload.beatId === 'string' && e.payload.beatId.length > 0;
}

/** Fold a flat event list into rows: single events, or spoken beats of 1+ declarations. */
export type FeedRow =
  | { kind: 'event'; event: TerminalEvent }
  | { kind: 'beat'; beatId: string; events: TerminalEvent[] };

export function foldSpokenBeats(events: TerminalEvent[]): FeedRow[] {
  const rows: FeedRow[] = [];
  for (const e of events) {
    if (isSpokenDeclaration(e)) {
      const last = rows[rows.length - 1];
      if (last && last.kind === 'beat' && last.beatId === e.payload.beatId) { last.events.push(e); continue; }
      rows.push({ kind: 'beat', beatId: e.payload.beatId, events: [e] });
    } else {
      rows.push({ kind: 'event', event: e });
    }
  }
  return rows;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function SpokenBeatBlock({ beatId, events }: { beatId: string; events: TerminalEvent[] }) {
  const [open, setOpen] = useState(false);
  const first = events[0];
  const sentences = events.map(e => (e.payload as GameEventPayload).description);
  const more = sentences.length - 1;
  const color = 'rgba(203, 217, 232, 0.6)'; // dim powder blue: transcript, not conversation

  return (
    <div
      className="flex items-start gap-2 px-2 py-1"
      data-spoken-beat={beatId}
      data-open={open ? '1' : '0'}
      role={more > 0 ? 'button' : undefined}
      tabIndex={more > 0 ? 0 : undefined}
      aria-expanded={more > 0 ? open : undefined}
      onClick={() => { if (more > 0) setOpen(o => !o); }}
      onKeyDown={(e) => { if (more > 0 && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(o => !o); } }}
      style={{ cursor: more > 0 ? 'pointer' : 'default' }}
      title={more > 0 ? (open ? 'Collapse the spoken beat' : `Show the whole beat (${sentences.length} sentences)`) : undefined}
    >
      <span
        aria-hidden
        className="text-[12px] flex-shrink-0"
        style={{ color, minWidth: '28px', textAlign: 'center', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
      >
        🎙
      </span>
      <div className="flex-1 min-w-0 text-[12px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color, lineHeight: 1.5 }}>
        {open ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{sentences.join(' ')}</div>
        ) : (
          <div className="truncate">
            {sentences[0]}
            {more > 0 && <span style={{ color: 'rgba(203, 217, 232, 0.4)', marginLeft: 6 }}>+{more}</span>}
          </div>
        )}
      </div>
      <span className="text-[12px] flex-shrink-0" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255,255,255,0.25)' }}>
        {fmtTime(first.timestamp)}
      </span>
    </div>
  );
}
