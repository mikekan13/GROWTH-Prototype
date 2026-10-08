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
import { buildFoldTree, openByDefaultKeys, filterTree, type FoldNode, type FoldItem } from './feed-tree';
import { FeedRow, TableFeedProvider, type FeedEntity } from './TableFeedRows';
import { TABLE_FEED_CSS } from './styles';

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
const PREFIX: Partial<Record<FoldNode['kind'], string>> = { rest: '☾ ', encounter: '⚔ ' };

function headerTitle(n: FoldNode, ts: FeedTimescale | null): string {
  const lines = `${n.lines} line${n.lines === 1 ? '' : 's'}`;
  if (n.kind === 'chapter' && n.chapter) {
    const h = n.chapter.harvest;
    const when = h ? `harvest ${h.cycle !== null ? dateOf(h.cycle, ts) : new Date(h.timestamp).toLocaleDateString()}` : 'current';
    return [n.label, when, `${n.chapter.sessions} session${n.chapter.sessions === 1 ? '' : 's'}`].join(' · ');
  }
  const span = n.cycles ? (() => { const a = dateOf(n.cycles[0], ts), b = dateOf(n.cycles[1], ts); return a === b ? a : `${a} – ${b}`; })() : null;
  return [`${PREFIX[n.kind] ?? ''}${n.label}`, span, lines].filter(Boolean).join(' · ');
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
}

function Fold({ node, depth, ctx }: { node: FoldNode; depth: number; ctx: TreeCtx }) {
  const open = ctx.isOpen(node);
  const liveEnc = node.kind === 'encounter' && node.live;
  const showSlot = !!ctx.encounterSlot && (liveEnc || (ctx.slotInSession && node.kind === 'session' && node.live));
  return (
    <section className={`fold k-${node.kind}${node.live ? ' live' : ''}`} data-fold={node.kind} data-open={open ? '1' : '0'}>
      <button
        type="button"
        className="fh"
        style={{ marginLeft: depth * 8, width: `calc(100% - ${depth * 8}px)` }}
        aria-expanded={open}
        data-no-hold
        onClick={() => ctx.toggle(node, open)}
      >
        <span className="arw" aria-hidden>{open ? '▾' : '▸'}</span>
        <span className="ttl">{headerTitle(node, ctx.timescale)}</span>
        {node.live && node.kind !== 'chapter' && <span className="livetag">Live</span>}
      </button>
      {open && (
        <div className="fb">
          {runs(node.items).map((r) => r.type === 'node'
            ? <Fold key={r.node.key} node={r.node} depth={depth + 1} ctx={ctx} />
            : <React.Fragment key={r.key}>{buildFeedRows(r.events, ctx.roster).map((row) => <FeedRow key={row.key} row={row} />)}</React.Fragment>)}
          {showSlot && !liveEnc && (
            <section className="fold k-encounter live" data-fold="encounter" data-open="1">
              <div className="fh static" style={{ marginLeft: (depth + 1) * 8, width: `calc(100% - ${(depth + 1) * 8}px)` }}><span className="arw" aria-hidden>{'▾'}</span><span className="ttl">{'⚔ '}Encounter</span></div>
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
  children,
}: {
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

  const roster = useMemo(() => entities.filter((e) => e.kind === 'npc').map((e) => ({ id: e.id, name: e.name })), [entities]);
  const liveEncounter = encounter?.live ?? null;
  const tree = useMemo(() => (sessions ? buildFoldTree(events, sessions, { emptyFrom, liveEncounter }) : null), [events, sessions, emptyFrom, liveEncounter]);
  const defaults = useMemo(() => (tree ? openByDefaultKeys(tree) : new Set<string>()), [tree]);
  const searching = !!query.trim();
  const found = useMemo(() => (tree && searching ? filterTree(tree, query) : null), [tree, searching, query]);
  const flatRows = useMemo(() => (tree ? [] : buildFeedRows(events, roster)), [tree, events, roster]);

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
  };

  const empty = shown ? shown.length === 0 : flatRows.length === 0;

  return (
    <TableFeedProvider entities={entities} timescale={timescale} onRevert={onRevert} reverting={reverting}>
      <style>{TABLE_FEED_CSS}</style>
      <div className={`tf${searching ? ' searching' : ''}`} data-table-feed data-hits={found ? found.hits : undefined}>
        {empty && <div className="empty">{loading ? 'Loading…' : searching ? '[NO LINE MATCHES]' : '[THE TABLE IS QUIET]'}</div>}
        {!shown && flatRows.map((row) => <FeedRow key={row.key} row={row} />)}
        {shown && shown.map((n) => <Fold key={n.key} node={n} depth={0} ctx={ctx} />)}
        {children}
      </div>
    </TableFeedProvider>
  );
}

