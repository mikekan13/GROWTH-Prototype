'use client';

/**
 * The TABLE tab's feed (ruling-feed-segment-colours-pillars, 2026-10-07): the
 * shared record drawn in the rulebook's row grammar on the page surface.
 * Builds rows from the logged events (feed-rows.ts), supplies the world's
 * names and the campaign calendar to the rows, and hosts whatever the drawer
 * puts under the last row (the growing line).
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { TerminalEvent } from '@/types/terminal';
import type { FeedTimescale } from '@/lib/feed-segments';
import { buildFeedRows } from './feed-rows';
import { FeedRow, TableFeedProvider, type FeedEntity } from './TableFeedRows';
import { TABLE_FEED_CSS } from './styles';

export default function TableFeed({
  campaignId,
  events,
  entities,
  loading,
  children,
}: {
  campaignId: string;
  events: TerminalEvent[];
  entities: FeedEntity[];
  loading?: boolean;
  /** Rendered under the last row, inside the feed's styles (the growing line). */
  children?: React.ReactNode;
}) {
  const [timescale, setTimescale] = useState<FeedTimescale | null>(null);

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
  const rows = useMemo(() => buildFeedRows(events, roster), [events, roster]);

  return (
    <TableFeedProvider entities={entities} timescale={timescale}>
      <style>{TABLE_FEED_CSS}</style>
      <div className="tf" data-table-feed>
        {rows.length === 0 && <div className="empty">{loading ? 'Loading…' : '[THE TABLE IS QUIET]'}</div>}
        {rows.map((row) => <FeedRow key={row.key} row={row} />)}
        {children}
      </div>
    </TableFeedProvider>
  );
}
