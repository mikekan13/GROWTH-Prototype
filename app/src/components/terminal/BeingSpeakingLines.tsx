'use client';

/**
 * A being's FINISHED line at the table (U2c 2026-10-06; reworked 2026-11-05).
 *
 * Michael: "the rewrites should happen off screen and the final cards printed once done." So nothing is drawn while a line is
 * composed: `start` / `partial` / `retract` never put text on the page (the big thinking card in CampaignTerminal shows while
 * the being works). Only a `final` is printed — once, as a TABLE feed character row — and held until the logged chat event for
 * the same line arrives, then it yields to it (no duplicate, no flicker). Safety net: yield anyway after 8 s.
 *   retract of a never-shown line: no-op. retract of a shown line: ignored with a console.warn (find the server cause).
 *   final kind=rest / empty: the being stayed silent, nothing is printed.
 * Source: `being_speaking` stream events re-broadcast by useCampaignStream as `growth:being-speaking`.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BeingSpeakingPhase } from '@/types/campaign-events';
import type { TerminalEvent } from '@/types/terminal';
import { parseSegments } from '@/lib/feed-segments';
import { reduceSpeaking, type HeldLine } from './table-feed/beat-state';
import { CharacterRow, TableFeedProvider, type FeedEntity } from './table-feed/TableFeedRows';
import type { CharacterRowModel } from './table-feed/feed-rows';

export const BEING_SPEAKING_EVENT = 'growth:being-speaking';
type GrowingLine = HeldLine;

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
  const linesRef = useRef<Map<string, GrowingLine>>(lines);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reducedMotion = useReducedMotion();

  const drop = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
    if (!linesRef.current.has(id)) return;
    const next = new Map(linesRef.current); next.delete(id); linesRef.current = next; setLines(next);
  }, []);
  const dropLater = useCallback((id: string, ms: number) => {
    const old = timersRef.current.get(id);
    if (old) clearTimeout(old);
    timersRef.current.set(id, setTimeout(() => drop(id), ms));
  }, [drop]);

  // Listen for the phases. Composing is off screen: partials carry no text to the page; only a FINAL line is held (beat-state.ts).
  useEffect(() => {
    const onPhase = (ev: Event) => {
      const d = (ev as CustomEvent<BeingSpeakingPhase>).detail;
      if (!d || !d.utteranceId) return;
      const r = reduceSpeaking(linesRef.current, d, Date.now(), FINAL_SAFETY_MS);
      linesRef.current = r.lines;
      setLines(r.lines);
      if (r.schedule) dropLater(r.schedule.id, r.schedule.ms);
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

  // Keep the bottom pinned when a finished line is printed.
  const finals = Array.from(lines.values()).filter(l => l.state === 'final');
  const sizeKey = finals.map(l => l.utteranceId + ':' + l.text.length).join('|');
  const onGrowRef = useRef(onGrow);
  useEffect(() => { onGrowRef.current = onGrow; }, [onGrow]);
  useEffect(() => { if (sizeKey) onGrowRef.current?.(); }, [sizeKey]);

  // Composing lines are off screen: only finished lines are drawn (once), as TABLE feed character rows.
  if (!active || finals.length === 0) return null;

  return (
    <TableFeedProvider entities={entities ?? NO_ENTITIES} timescale={null}>
      <div className="tf tf-tail" data-being-speaking aria-live="polite">
        {finals.map(line => {
          const row: CharacterRowModel = {
            type: 'character',
            key: line.utteranceId,
            timestamp: new Date(line.startedAt).toISOString(),
            characterId: line.characterId || null,
            name: line.characterName || '…',
            segments: parseSegments(line.text),
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
              className={reducedMotion ? undefined : 'tf-appear'}
            >
              <CharacterRow row={row} />
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
