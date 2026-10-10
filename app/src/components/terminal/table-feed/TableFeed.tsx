'use client';

/**
 * The drawer's one feed (ruling-feed-segment-colours-pillars, 2026-10-07;
 * TERMINAL + TABLE merged 2026-10-08): the shared record drawn in the
 * rulebook's row grammar on the page surface.
 *
 * Given `sessions`, the history is a FOLD TREE (feed-tree.ts, Mike
 * 2026-10-08): chapter (delimited by harvests) > session / between sessions >
 * rest stretch > encounter > lines. One header style at every level, indented
 * by depth: name · in-world range · line count. The live path is open,
 * everything else folded; folds are per viewer (localStorage `foldKey`).
 * `query` filters to matching lines, opens the folds holding them and marks
 * them; clearing it restores the viewer's folds. The live encounter's
 * controls (EncounterPanel, via `encounter.render`) sit inside its fold.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { TerminalEvent, GameSessionInfo } from '@/types/terminal';
import { presentCycle, type FeedTimescale } from '@/lib/feed-segments';
import { buildFeedRows, type RosterName } from './feed-rows';
import { buildFoldTree, openByDefaultKeys, filterTree, revealKeys, type FoldNode, type FoldItem, type FoldKeep } from './feed-tree';
import { FeedRow, TableFeedProvider, type FeedEntity } from './TableFeedRows';
import { TABLE_FEED_CSS } from './styles';
import { perceivedFeedEntities } from './perceived-entities';

type Folds = Record<string, boolean>; // key → open (the viewer's own choices)

function readFolds(key: string | undefined): Folds {
  if (!key) return {};
  try { const raw = window.localStorage.getItem(key); return raw ? (JSON.parse(raw) as Folds) : {}; } catch { return {}; }
}
function writeFolds(key: string | undefined, folds: Folds) {
  if (!key) return;
  try { window.localStorage.setItem(key, JSON.stringify(folds)); } catch { /* private window: folds just won't persist */ }
}

const dateOf = (cycle: number, ts: FeedTimescale | null) => presentCycle(cycle, ts).split(' · ')[0];
function roman(n: number): string {
  const table: Array<[number, string]> = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, r] of table) while (n >= v) { out += r; n -= v; }
  return out || '0';
}

/** "in-world range · N lines" — the meta that every level carries. */
function meta(n: FoldNode, ts: FeedTimescale | null): string {
  const lines = `${n.lines} line${n.lines === 1 ? '' : 's'}`;
  const span = n.cycles ? (() => { const a = dateOf(n.cycles[0], ts), b = dateOf(n.cycles[1], ts); return a === b ? a : `${a} – ${b}`; })() : null;
  return [span, lines].filter(Boolean).join(' · ');
}

/**
 * Each level in the Core Rulebook's own heading voice (v0.4.5):
 *   chapter   = the chapter opener, p 20 ("II: New Beginnings…"): Inknut Antiqua on the coral bar,
 *               centred, a short rule, and the Bebas italic navy line under it;
 *   session   = the section heading, p 20 "2.1 GROWING A CHARACTER": Bebas gold on a navy strip
 *               that hugs the text, decimal-numbered (chapter.session);
 *   rest      = the sub-section heading, p 20 "2.1.1 SEEDS, ROOTS & BRANCHES": the same strip, smaller;
 *   encounter = the combat heading, p 131 "=== [THE THREE PHASES] ===": Consolas bold white on black.
 * The hierarchy reads by type and number, so there is no indentation.
 */
function Heading({ node, num, open, ts }: { node: FoldNode; num: string; open: boolean; ts: FeedTimescale | null }) {
  const arw = <span className="arw" aria-hidden>{open ? '▾' : '▸'}</span>;
  // "Live" only where play is happening (a live session or encounter) — an open-by-default stretch is not live.
  const live = node.live && (node.kind === 'session' || node.kind === 'encounter') ? <span className="livetag">Live</span> : null;
  switch (node.kind) {
    case 'chapter': {
      const c = node.chapter;
      const h = c?.harvest;
      const when = h ? `harvest ${h.cycle !== null ? dateOf(h.cycle, ts) : new Date(h.timestamp).toLocaleDateString()}` : 'the current chapter';
      const sessions = c ? `${c.sessions} session${c.sessions === 1 ? '' : 's'}` : '';
      return (
        <>
          <span className="ch-bar">{arw}Chapter {roman(c?.number ?? 1)}</span>
          <span className="ch-rule" aria-hidden>{'———'}</span>
          <span className="ch-sub">{[when, sessions, `${node.lines} line${node.lines === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
        </>
      );
    }
    case 'encounter':
      return (
        <>
          <span className="cb-bar">{arw}{'=== ['}{node.label.toUpperCase()}{'] ==='}</span>
          <span className="meta">{meta(node, ts)}</span>
          {live}
        </>
      );
    default: {
      const title = node.kind === 'session' && node.session
        ? `${num} ${node.session.name ?? `Session ${node.session.number}`}`
        : node.kind === 'rest' ? `${num} ${node.label}` : node.label;
      return (
        <>
          <span className="badge">{arw}{title}</span>
          <span className="meta">{meta(node, ts)}</span>
          {live}
        </>
      );
    }
  }
}

/** Consecutive lines render together so a spoken beat still folds as one row. */
function runs(items: FoldItem[]): Array<{ type: 'events'; events: TerminalEvent[]; key: string } | { type: 'node'; node: FoldNode }> {
  const out: Array<{ type: 'events'; events: TerminalEvent[]; key: string } | { type: 'node'; node: FoldNode }> = [];
  for (const it of items) {
    if (it.type === 'node') { out.push(it); continue; }
    const last = out[out.length - 1];
    if (last && last.type === 'events') last.events.push(it.event);
    else out.push({ type: 'events', events: [it.event], key: `run-${it.event.id}` });
  }
  return out;
}

interface TreeCtx {
  isOpen: (n: FoldNode) => boolean;
  toggle: (n: FoldNode, open: boolean) => void;
  roster: RosterName[];
  timescale: FeedTimescale | null;
  encounterSlot: React.ReactNode;
  /** No encounter fold is live: the controls go at the end of the live session instead. */
  slotInSession: boolean;
  logRefs?: Map<string, string[]>;
}

function Fold({ node, num, ctx }: { node: FoldNode; num: string; ctx: TreeCtx }) {
  const open = ctx.isOpen(node);
  const liveEnc = node.kind === 'encounter' && node.live;
  const showSlot = !!ctx.encounterSlot && (liveEnc || (ctx.slotInSession && node.kind === 'session' && node.live));
  // The book's decimal numbering: chapter 1 → session 1.6 → rest 1.6.1.
  const nums = new Map<string, string>();
  let restN = 0;
  for (const it of node.items) {
    if (it.type !== 'node') continue;
    const child = it.node;
    if (child.kind === 'session' && child.session) nums.set(child.key, `${num}.${child.session.number}`);
    else if (child.kind === 'rest') { restN += 1; nums.set(child.key, `${num}.${restN}`); }
    else nums.set(child.key, num);
  }
  return (
    <section className={`fold k-${node.kind}${node.live ? ' live' : ''}`} data-fold={node.kind} data-open={open ? '1' : '0'}>
      <button type="button" className={`fh h-${node.kind}`} aria-expanded={open} data-no-hold onClick={() => ctx.toggle(node, open)}>
        <Heading node={node} num={num} open={open} ts={ctx.timescale} />
      </button>
      {open && (
        <div className="fb">
          {runs(node.items).map((r) => r.type === 'node'
            ? <Fold key={r.node.key} node={r.node} num={nums.get(r.node.key) ?? num} ctx={ctx} />
            : <React.Fragment key={r.key}>{buildFeedRows(r.events, ctx.roster, ctx.logRefs).map((row) => <FeedRow key={row.key} row={row} />)}</React.Fragment>)}
          {showSlot && !liveEnc && (
            <section className="fold k-encounter live" data-fold="encounter" data-open="1">
              <div className="fh h-encounter static"><span className="cb-bar">{'=== [ENCOUNTER] ==='}</span></div>
              <div className="encslot">{ctx.encounterSlot}</div>
            </section>
          )}
          {showSlot && liveEnc && <div className="encslot">{ctx.encounterSlot}</div>}
        </div>
      )}
    </section>
  );
}

export default function TableFeed({
  campaignId,
  events,
  entities,
  loading,
  onRevert,
  reverting,
  sessions,
  emptyFrom = null,
  foldKey,
  query = '',
  encounter,
  keep,
  dropBetween = false,
  prune = false,
  logRefs,
  onOpenLog,
  reveal,
  emptyText = '[THE TABLE IS QUIET]',
  perceived = false,
  children,
}: {
  /** Perception unit 9: the events are this viewer's perceived feed — spans/tooltips come only from the lines' own tokens. */
  perceived?: boolean;
  campaignId: string;
  events: TerminalEvent[];
  entities: FeedEntity[];
  loading?: boolean;
  /** Revert a character change (the old TERMINAL row's REVERT, kept in the one feed). */
  onRevert?: (entryId: string) => void;
  reverting?: string | null;
  /** Given: lay the history out as the fold tree. */
  sessions?: GameSessionInfo[];
  /** Sessions starting before this have no fold unless lines of theirs are loaded (paging). */
  emptyFrom?: string | null;
  /** localStorage key for this viewer's folds. */
  foldKey?: string;
  /** Search: only matching lines, their folds opened. */
  query?: string;
  /** The live encounter (GM, live session): matched to its fold, whose body carries `render()`. */
  encounter?: { live: { id: string | null; name: string } | null; render: () => React.ReactNode };
  /** Which lines show (feed-split.ts: feedKeep / logKeep); structure is built from every event. */
  keep?: FoldKeep;
  /** Leave out the between-sessions stretches (the Terminal feed shows play only). */
  dropBetween?: boolean;
  /** Drop folds left with no lines (the Log). */
  prune?: boolean;
  /** Feed line id → mechanical rows behind it; with `onOpenLog`, the line links to them. */
  logRefs?: Map<string, string[]>;
  onOpenLog?: (ids: string[]) => void;
  /** Rows to open the folds of and mark (a feed link's targets, in the Log). */
  reveal?: Set<string> | null;
  emptyText?: string;
  /** Rendered under the last row, inside the feed's styles (the growing line). */
  children?: React.ReactNode;
}) {
  const [timescale, setTimescale] = useState<FeedTimescale | null>(null);
  const [folds, setFolds] = useState<Folds>({});
  useEffect(() => { setFolds(readFolds(foldKey)); }, [foldKey]);

  // The campaign's presented calendar, once — in-world time is shown first on every line.
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
  const roster = useMemo(() => feedEntities.filter((e) => e.kind === 'npc').map((e) => ({ id: e.id, name: e.name })), [feedEntities]);
  const liveEncounter = encounter?.live ?? null;
  const tree = useMemo(
    () => (sessions ? buildFoldTree(events, sessions, { emptyFrom, liveEncounter, keep, dropBetween, prune }) : null),
    [events, sessions, emptyFrom, liveEncounter, keep, dropBetween, prune],
  );
  const revealed = useMemo(() => (tree && reveal && reveal.size ? revealKeys(tree, reveal) : null), [tree, reveal]);
  // A link jumped here: open the folds holding its rows (once — the viewer can fold them again).
  useEffect(() => {
    if (!revealed || revealed.size === 0) return;
    setFolds((prev) => { const next = { ...prev }; revealed.forEach((k) => { next[k] = true; }); return next; });
  }, [revealed]);
  const defaults = useMemo(() => (tree ? openByDefaultKeys(tree) : new Set<string>()), [tree]);
  const searching = !!query.trim();
  const found = useMemo(() => (tree && searching ? filterTree(tree, query) : null), [tree, searching, query]);
  const flatRows = useMemo(() => (tree ? [] : buildFeedRows(events, roster, logRefs)), [tree, events, roster, logRefs]);

  const toggle = useCallback((n: FoldNode, open: boolean) => {
    setFolds((prev) => { const next = { ...prev, [n.key]: !open }; writeFolds(foldKey, next); return next; });
  }, [foldKey]);

  const shown = found ? found.tree : tree;
  const anyLiveEncounterFold = useMemo(() => {
    const walk = (n: FoldNode): boolean => (n.kind === 'encounter' && n.live) || n.items.some((i) => i.type === 'node' && walk(i.node));
    return !!tree && tree.some(walk);
  }, [tree]);
  const ctx: TreeCtx = {
    isOpen: (n) => (found ? found.openKeys.has(n.key) : (folds[n.key] ?? defaults.has(n.key))),
    toggle,
    roster,
    timescale,
    encounterSlot: encounter && !searching ? encounter.render() : null,
    slotInSession: !anyLiveEncounterFold,
    logRefs,
  };

  const empty = shown ? shown.length === 0 : flatRows.length === 0;

  return (
    <TableFeedProvider entities={feedEntities} perceived={perceived} timescale={timescale} onRevert={onRevert} reverting={reverting} onOpenLog={onOpenLog} highlight={reveal ?? undefined}>
      <style>{TABLE_FEED_CSS}</style>
      <div className={`tf${searching ? ' searching' : ''}`} data-table-feed data-hits={found ? found.hits : undefined}>
        {empty && <div className="empty">{loading ? 'Loading…' : searching ? '[NO LINE MATCHES]' : emptyText}</div>}
        {!shown && flatRows.map((row) => <FeedRow key={row.key} row={row} />)}
        {shown && shown.map((n) => <Fold key={n.key} node={n} num={String(n.chapter?.number ?? 1)} ctx={ctx} />)}
        {children}
      </div>
    </TableFeedProvider>
  );
}

