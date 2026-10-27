'use client';

/**
 * OUT OF A SESSION the Terminal is a black novel (Mike 2026-10-26): white on black in the terminal font, the record
 * as prose (compose-novel.ts), no cards or marks. Named things are KRMA-gold dynamic tooltips (hover = tooltip,
 * click = centre the canvas) — the same EntitySpan the live feed uses. In a session the live look is untouched;
 * at session start this same view is the loading screen (warmup/WarmupStage.tsx).
 *
 * The Watcher's truth record reads omniscient; a viewer who is a character (a Trailblazer, or the Watcher's
 * view-as) reads first person, built from the rows that reached that character.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { TerminalEvent } from '@/types/terminal';
import { presentCycle, type FeedTimescale } from '@/lib/feed-segments';
import { buildFeedRows } from '../table-feed/feed-rows';
import { TableFeedProvider, EntityText, type FeedEntity } from '../table-feed/TableFeedRows';
import { TABLE_FEED_CSS } from '../table-feed/styles';
import { perceivedFeedEntities } from '../table-feed/perceived-entities';
import { composeNovel, genderFromSex, type Gender, type NovelViewer, type ThoughtStyle } from './compose-novel';

export const NOVEL_GOLD = '#ffcc78';

const NOVEL_CSS = `
.nv{background:#000;color:#fff;font-family:var(--font-terminal),Consolas,monospace;font-size:15px;line-height:1.75;padding:26px 22px 44px;min-height:100%;box-sizing:border-box}
.nv .pg{margin:0 0 1.15em;max-width:70ch;overflow-wrap:anywhere}
.nv .inner{font-style:italic}
.nv .brk{margin:1.9em 0 1.4em;max-width:70ch;color:rgba(255,255,255,.55);font-size:12px;letter-spacing:.18em;text-transform:uppercase}
.nv .empty{color:rgba(255,255,255,.6)}
.nv .ent{position:relative;cursor:pointer;color:${NOVEL_GOLD};background:none;border:0;padding:0;font:inherit;font-weight:inherit;outline:none}
.nv .ent:hover,.nv .ent.open,.nv .ent:focus-visible{text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:4px}
`;

/** "26th Oct, Y3 · 19:00" — the date and the hour; a thin break is laid wherever it changes. */
export function hourLabel(cycle: number, ts: FeedTimescale | null): string | null {
  const parts = presentCycle(cycle, ts).split(' · ');
  if (parts.length < 2) return null;
  return `${parts[0]} · ${parts[1].slice(0, 2)}:00`;
}

export default function NovelView({
  campaignId,
  events,
  entities,
  perceived = false,
  viewer,
  thoughtStyle = 'inner',
  loading = false,
}: {
  campaignId: string;
  events: TerminalEvent[];
  entities: FeedEntity[];
  /** The events are this viewer's perceived feed (spans come from the lines' own tokens). */
  perceived?: boolean;
  /** null = the truth record (omniscient narrator); a character = first person. */
  viewer: NovelViewer | null;
  thoughtStyle?: ThoughtStyle;
  loading?: boolean;
}) {
  const [timescale, setTimescale] = useState<FeedTimescale | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/clock`);
        if (!res.ok) return;
        const data = (await res.json()) as { defaultTimescale?: FeedTimescale };
        if (!cancelled && data.defaultTimescale) setTimescale(data.defaultTimescale);
      } catch { /* the standard reckoning is used */ }
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  const feedEntities = useMemo(() => (perceived ? perceivedFeedEntities(events, entities) : entities), [perceived, events, entities]);
  const roster = useMemo(() => feedEntities.filter((e) => e.kind === 'npc' || e.kind === 'character').map((e) => ({ id: e.id, name: e.name })), [feedEntities]);
  const blocks = useMemo(() => {
    const rows = buildFeedRows(events, roster);
    const sexes = new Map<string, Gender>();
    for (const e of feedEntities) { const g = genderFromSex(e.sex); if (g) { sexes.set(e.id, g); sexes.set(e.name, g); } }
    return composeNovel(rows, viewer, { thoughtStyle, sexes, breakLabel: (c) => hourLabel(c, timescale) });
  }, [events, roster, feedEntities, viewer, thoughtStyle, timescale]);

  return (
    <TableFeedProvider entities={feedEntities} perceived={perceived} timescale={timescale}>
      <style>{TABLE_FEED_CSS}</style>
      <style>{NOVEL_CSS}</style>
      <div className="nv" data-novel-view data-viewer={viewer ? 'first-person' : 'omniscient'}>
        {blocks.length === 0 && <p className="pg empty">{loading ? 'Loading…' : 'The record is empty.'}</p>}
        {blocks.map((b) => b.kind === 'break'
          ? <div key={b.key} className="brk" data-novel-break>{b.text}</div>
          : (
            <p key={b.key} className="pg" data-novel-para>
              {b.runs.map((r, i) => (
                <span key={i} className={r.inner ? 'inner' : undefined}>
                  <EntityText text={r.text} source="from: the record" />
                </span>
              ))}
            </p>
          ))}
      </div>
    </TableFeedProvider>
  );
}
