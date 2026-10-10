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
 *   retract — the line is withdrawn (sealed): struck through with the coral
 *             LINE WITHDRAWN correction (rulebook p 63), fade, close the slot.
 *             The rule is never shown.
 *
 * Drawn as a TABLE feed character row (ruling-feed-segment-colours-pillars,
 * 2026-10-07): portrait chip, pillar bars parsed from the words so far, caret.
 *   final   — always closes a start. kind=rest → the being stayed silent, the
 *             line just goes away. Otherwise hold the final text until the
 *             logged chat event for the same line arrives, then yield to it
 *             (no duplicate, no flicker). Safety net: yield anyway after 8 s.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BeingSpeakingPhase } from '@/types/campaign-events';
import type { TerminalEvent } from '@/types/terminal';
import { parseSegments } from '@/lib/feed-segments';
import { CharacterRow, TableFeedProvider, type FeedEntity } from './table-feed/TableFeedRows';
import type { CharacterRowModel } from './table-feed/feed-rows';

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
  entities,
}: {
  /** Only the TABLE tab shows growing lines. */
  active: boolean;
  /** The terminal's logged events — a finished line yields to its chat row. */
  events: TerminalEvent[];
  /** Fired after the block grows so the parent can keep the bottom pinned. */
  onGrow?: () => void;
  /** The campaign's world (portraits, entity spans) — the line is drawn as a TABLE feed character row. */
  entities?: FeedEntity[];
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

  // Drawn as a TABLE feed character row (ruling 2026-10-07): chip + pillar
  // bars parsed from the line so far, a caret while it grows; a withdrawn
  // line is struck through with the coral LINE WITHDRAWN correction, then fades.
  return (
    <TableFeedProvider entities={entities ?? NO_ENTITIES} timescale={null}>
      <div className="tf tf-tail" data-being-speaking aria-live="polite">
        {Array.from(lines.values()).map(line => {
          const row: CharacterRowModel = {
            type: 'character',
            key: line.utteranceId,
            timestamp: new Date(line.startedAt).toISOString(),
            characterId: line.characterId || null,
            name: line.characterName || '…',
            segments: parseSegments(line.text, { growing: line.state === 'speaking' }),
            raw: line.text,
            via: 'being',
            voice: 'Being',
            voicedBy: null,
            fromNarration: false,
          };
          return (
            <div
              key={line.utteranceId}
              data-utterance-id={line.utteranceId}
              data-state={line.state}
              className={line.state === 'withdrawn' && !reducedMotion ? 'fading' : undefined}
            >
              <CharacterRow row={row} caret={line.state === 'speaking'} withdrawn={line.state === 'withdrawn'} />
            </div>
          );
        })}
      </div>
    </TableFeedProvider>
  );
}

const NO_ENTITIES: FeedEntity[] = [];

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
