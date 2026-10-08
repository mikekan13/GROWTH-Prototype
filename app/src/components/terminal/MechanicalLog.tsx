'use client';

/**
 * The jEWL tab's LOG (Mike 2026-10-08): the mechanics behind the story —
 * character changes (with their ↶ revert), checks, item / location / KRMA /
 * planning rows — and everything that happened between sessions (out-of-play
 * setup and planning). Folded by the same chapter > session > rest > encounter
 * tree as the Terminal feed, filtered by kind and by character.
 *
 * Cut from the same loaded events as the feed (feed-split.ts#logKeep): it shows
 * nothing a member could not already load. KRMA rows: the Watcher only.
 *
 * `reveal` = the rows a feed line's link points at: filters clear, their folds
 * open, they are marked and scrolled to.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TerminalEvent, GameSessionInfo } from '@/types/terminal';
import TableFeed from './table-feed/TableFeed';
import type { FeedEntity } from './table-feed/TableFeedRows';
import type { FoldKeep } from './table-feed/feed-tree';
import { LOG_KINDS, logKeep, logCharacters, mechanicalKind, type LogKind } from './table-feed/feed-split';

const mono = 'var(--font-terminal), Consolas, monospace';

export default function MechanicalLog({
  campaignId,
  events,
  sessions,
  entities,
  emptyFrom,
  isGM,
  onRevert,
  reverting,
  reveal,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: {
  campaignId: string;
  events: TerminalEvent[];
  sessions: GameSessionInfo[];
  entities: FeedEntity[];
  emptyFrom: string | null;
  isGM: boolean;
  onRevert?: (entryId: string) => void;
  reverting?: string | null;
  reveal: Set<string> | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}) {
  const [kinds, setKinds] = useState<Set<LogKind>>(new Set());
  const [characterId, setCharacterId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A feed link jumped here: show everything, so its rows are not filtered away.
  useEffect(() => {
    if (!reveal || reveal.size === 0) return;
    setKinds(new Set());
    setCharacterId(null);
  }, [reveal]);

  const keep = useCallback<FoldKeep>(
    (e, where) => logKeep(e, where, { kinds, characterId, isGM }),
    [kinds, characterId, isGM],
  );

  const characters = useMemo(() => logCharacters(events.filter((e) => mechanicalKind(e) !== null)), [events]);
  const kindsShown = useMemo(() => LOG_KINDS.filter((k) => k.kind !== 'krma' || isGM), [isGM]);

  const toggleKind = (k: LogKind) => setKinds((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  // Scroll the first revealed row into view once its folds have opened.
  useEffect(() => {
    if (!reveal || reveal.size === 0) return;
    const el = scrollRef.current;
    if (!el) return;
    let tries = 0;
    const tick = () => {
      const target = [...reveal].map((id) => el.querySelector(`[data-key="${CSS.escape(id)}"]`)).find(Boolean) as HTMLElement | undefined;
      if (target) { target.scrollIntoView({ block: 'center' }); return; }
      if (++tries < 10) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [reveal]);

  const chip = (on: boolean): React.CSSProperties => ({
    minHeight: 36, minWidth: 36, padding: '2px 8px 0', border: 0, cursor: 'pointer', flex: 'none',
    fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', fontSize: 15, letterSpacing: '0.06em',
    background: on ? '#002f6c' : 'transparent', color: on ? '#ffcc78' : '#002f6c',
    boxShadow: on ? undefined : 'inset 0 0 0 1.5px #002f6c',
  });

  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0, backgroundColor: '#cfe2f2' }} data-mechanical-log>
      <div style={{ flex: 'none', padding: '6px 10px 6px 14px', borderBottom: '1px solid rgba(0,47,108,0.25)' }}>
        {/* One row that scrolls sideways on a phone, so the Log keeps its height. */}
        <div role="group" aria-label="Filter the Log by kind" data-log-filters style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {kindsShown.map((k) => (
            <button key={k.kind} type="button" data-no-hold data-log-kind={k.kind} aria-pressed={kinds.has(k.kind)} onClick={() => toggleKind(k.kind)} style={chip(kinds.has(k.kind))}>
              {k.label}
            </button>
          ))}
          {characters.length > 0 && (
            <select
              aria-label="Filter the Log by character"
              data-log-character
              value={characterId ?? ''}
              onChange={(e) => setCharacterId(e.target.value || null)}
              className="text-[16px] md:text-[14px]"
              style={{ minHeight: 36, flex: 'none', fontFamily: mono, color: '#000', background: '#fff', border: 0, borderLeft: '4px solid #002f6c', padding: '0 6px', maxWidth: 220 }}
            >
              <option value="">Every character</option>
              {characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden" style={{ minHeight: 0 }} data-log-scroll>
        {hasOlder && (
          <div style={{ padding: '8px 12px 0 14px' }}>
            <button onClick={onLoadOlder} disabled={loadingOlder} data-no-hold style={{
              minHeight: 36, padding: 0, border: 0, background: 'none', cursor: 'pointer', textAlign: 'left',
              fontFamily: mono, fontWeight: 700, fontSize: 13,
            }}>
              <span style={{ background: '#000', color: '#f5f4ef', padding: '1px 5px' }}>{loadingOlder ? '[...LOADING EARLIER...]' : '[...EARLIER HISTORY...]'}</span>
            </button>
          </div>
        )}
        <TableFeed
          campaignId={campaignId}
          events={events}
          entities={entities}
          onRevert={onRevert}
          reverting={reverting}
          sessions={sessions}
          emptyFrom={emptyFrom}
          foldKey={`growth:log-folds:${campaignId}`}
          keep={keep}
          prune
          reveal={reveal}
          emptyText={kinds.size || characterId ? '[NOTHING OF THAT KIND IS LOADED]' : '[THE LOG IS EMPTY]'}
        />
      </div>
    </div>
  );
}
