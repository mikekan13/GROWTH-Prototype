'use client';

/**
 * The GROWING LINE (U2c, 2026-10-06): while a being at the table is still
 * speaking, its words appear here as they arrive, under the last logged
 * event and above the speak bar — reading as someone talking, not as a
 * loading state.
 *
 * Source: `being_speaking` stream events, re-broadcast by useCampaignStream
 * as the window event `growth:being-speaking` (detail = BeingSpeakingPhase):
 *   start   — open a line for utteranceId
 *   partial — `text` is the WHOLE line so far; render it (delta ignored)
 *   retract — the line is withdrawn (sealed): collapse to a quiet
 *             "— line withdrawn —", fade, close the slot. The rule is never shown.
 *   final   — always closes a start. kind=rest → the being stayed silent, the
 *             line just goes away. Otherwise hold the final text until the
 *             logged chat event for the same line arrives, then yield to it
 *             (no duplicate, no flicker). Safety net: yield anyway after 8 s.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BeingSpeakingPhase } from '@/types/campaign-events';
import type { TerminalEvent } from '@/types/terminal';

export const BEING_SPEAKING_EVENT = 'growth:being-speaking';

interface GrowingLine {
  utteranceId: string;
  characterId: string;
  characterName: string;
  text: string;
  state: 'speaking' | 'final' | 'withdrawn';
  startedAt: number;
  finalAt?: number;
}

/** How long a withdrawn line lingers before its slot closes (fade is 2 s). */
const WITHDRAWN_MS = 2200;
/** If the logged chat line never shows up, stop holding the final text. */
const FINAL_SAFETY_MS = 8000;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Does this logged event carry the finished line we are holding? */
function matchesFinal(e: TerminalEvent, line: GrowingLine): boolean {
  if (e.payload.kind !== 'chat') return false;
  const sameBeing = e.characterId === line.characterId
    || e.characterName === line.characterName
    || e.actorName === line.characterName;
  if (!sameBeing) return false;
  const a = norm(e.payload.message), b = norm(line.text);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export default function BeingSpeakingLines({
  active,
  events,
  onGrow,
  color = 'var(--terminal-prime)',
}: {
  /** Only the TABLE tab shows growing lines. */
  active: boolean;
  /** The terminal's logged events — a finished line yields to its chat row. */
  events: TerminalEvent[];
  /** Fired after the block grows so the parent can keep the bottom pinned. */
  onGrow?: () => void;
  color?: string;
}) {
  const [lines, setLines] = useState<Map<string, GrowingLine>>(() => new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reducedMotion = useReducedMotion();

  const drop = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
    setLines(prev => { if (!prev.has(id)) return prev; const next = new Map(prev); next.delete(id); return next; });
  }, []);
  const dropLater = useCallback((id: string, ms: number) => {
    const old = timersRef.current.get(id);
    if (old) clearTimeout(old);
    timersRef.current.set(id, setTimeout(() => drop(id), ms));
  }, [drop]);

  // Listen for the phases.
  useEffect(() => {
    const onPhase = (ev: Event) => {
      const d = (ev as CustomEvent<BeingSpeakingPhase>).detail;
      if (!d || !d.utteranceId) return;
      setLines(prev => {
        const next = new Map(prev);
        const cur = next.get(d.utteranceId);
        switch (d.phase) {
          case 'start':
            next.set(d.utteranceId, { utteranceId: d.utteranceId, characterId: d.characterId, characterName: d.characterName, text: '', state: 'speaking', startedAt: Date.now() });
            break;
          case 'partial':
            if (cur) next.set(d.utteranceId, { ...cur, text: d.text, state: 'speaking' });
            else next.set(d.utteranceId, { utteranceId: d.utteranceId, characterId: d.characterId, characterName: '', text: d.text, state: 'speaking', startedAt: Date.now() });
            break;
          case 'retract':
            if (cur) { next.set(d.utteranceId, { ...cur, state: 'withdrawn' }); dropLater(d.utteranceId, WITHDRAWN_MS); }
            break;
          case 'final':
            // action: speak | act | attend | rest. rest = the being stayed silent.
            if (d.action === 'rest' || !norm(d.text)) { next.delete(d.utteranceId); dropLater(d.utteranceId, 0); }
            else if (cur) { next.set(d.utteranceId, { ...cur, text: d.text, state: 'final', finalAt: Date.now() }); dropLater(d.utteranceId, FINAL_SAFETY_MS); }
            break;
        }
        return next;
      });
    };
    window.addEventListener(BEING_SPEAKING_EVENT, onPhase);
    const timers = timersRef.current;
    return () => { window.removeEventListener(BEING_SPEAKING_EVENT, onPhase); for (const t of timers.values()) clearTimeout(t); timers.clear(); };
  }, [dropLater]);

  // A finished line yields to its logged chat row the moment that row exists
  // (the drop is scheduled, not synchronous, so no render cascade).
  useEffect(() => {
    if (lines.size === 0 || events.length === 0) return;
    const recent = events.slice(-40);
    for (const line of lines.values()) {
      if (line.state !== 'final') continue;
      if (recent.some(e => matchesFinal(e, line))) dropLater(line.utteranceId, 0);
    }
  }, [events, lines, dropLater]);

  // Keep the bottom pinned while a line grows.
  const sizeKey = Array.from(lines.values()).map(l => l.utteranceId + ':' + l.text.length + ':' + l.state).join('|');
  const onGrowRef = useRef(onGrow);
  useEffect(() => { onGrowRef.current = onGrow; }, [onGrow]);
  useEffect(() => { if (sizeKey) onGrowRef.current?.(); }, [sizeKey]);

  if (!active || lines.size === 0) return null;

  return (
    <div className="space-y-1" data-being-speaking aria-live="polite">
      {Array.from(lines.values()).map(line => (
        <div key={line.utteranceId} className="flex items-start gap-2 px-2 py-1.5" data-utterance-id={line.utteranceId} data-state={line.state}>
          <span className="text-[12px] font-bold px-1.5 py-0.5 flex-shrink-0" style={{
            backgroundColor: line.state === 'withdrawn' ? 'transparent' : color,
            color: line.state === 'withdrawn' ? color : '#fff',
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            borderRadius: '1px', minWidth: '28px', textAlign: 'center',
            opacity: line.state === 'withdrawn' ? 0.6 : 1,
          }}>
            NPC
          </span>
          <div className="flex-1 min-w-0">
            {line.state === 'withdrawn' ? (
              <span
                className="text-[12px] italic"
                style={{
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  color,
                  opacity: 0.55,
                  display: 'inline-block',
                  animation: reducedMotion ? undefined : `being-withdrawn ${WITHDRAWN_MS - 200}ms ease-out forwards`,
                }}
              >
                — line withdrawn —
              </span>
            ) : (
              <span className="text-[12px]" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: '#ccc' }}>
                <span style={{ color, fontWeight: 'bold' }}>{line.characterName || '…'}</span>
                {': '}
                {line.text}
                {line.state === 'speaking' && (
                  <span aria-hidden style={{ color, marginLeft: 1, animation: reducedMotion ? undefined : 'being-caret 1s steps(1) infinite' }}>▍</span>
                )}
              </span>
            )}
          </div>
          <span className="text-[12px] flex-shrink-0" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace', color: 'rgba(255,255,255,0.25)' }}>
            {line.state === 'speaking' ? 'speaking' : line.state === 'final' ? '…' : ''}
          </span>
        </div>
      ))}
      <style>{`
        @keyframes being-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes being-withdrawn { 0% { opacity: 0.55; } 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}

/** prefers-reduced-motion, SSR-safe (false on the server). */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(q.matches);
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return reduced;
}
