/**
 * The one feed's history, paged (Mike 2026-10-08: "Even when not in play the
 * players and GM might want to see previous sessions"). Two sources — campaign
 * events and the character changelog — are each read newest-first by a
 * createdAt cursor. A page keeps only what is newer than the LATER of the two
 * sources' oldest rows while that source has more, so the merged list never
 * shows a gap; the rows cut off come back with the next page.
 *
 * Pure.
 */
import type { TerminalEvent, GameSessionInfo } from '@/types/terminal';

export interface SourcePage<T> {
  rows: T[];
  /** The source's own cursor for its next page (null = no more). */
  nextCursor: string | null;
}

const ts = (iso: string) => new Date(iso).getTime();

/**
 * Where the merged page ends: the newest "oldest row" among sources that still
 * have more. null = both sources are exhausted (the page reaches the start).
 */
export function pageCutoff(pages: Array<{ oldest: string | null; hasMore: boolean }>): string | null {
  let cut: number | null = null;
  for (const p of pages) {
    if (!p.hasMore || !p.oldest) continue;
    const t = ts(p.oldest);
    if (cut === null || t > cut) cut = t;
  }
  return cut === null ? null : new Date(cut).toISOString();
}

/** Keep rows at or after the cutoff (all of them when there is none). */
export function keepFrom(events: TerminalEvent[], cutoff: string | null): TerminalEvent[] {
  if (!cutoff) return events;
  const c = ts(cutoff);
  return events.filter((e) => ts(e.timestamp) >= c);
}

/** Merge by id (incoming wins — a reverted change replaces its old row), oldest first. */
export function mergeEvents(prev: TerminalEvent[], incoming: TerminalEvent[]): TerminalEvent[] {
  const byId = new Map(prev.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => ts(a.timestamp) - ts(b.timestamp));
}

/**
 * Session boundaries as rows: start and end of every session, drawn as the
 * teal system rows. Built from the session list, so a session started from
 * any surface gets its markers; the logged session_start/_end game events are
 * dropped from the feed in their favour (see withoutLoggedSessionLines).
 */
export function sessionMarkers(sessions: GameSessionInfo[], campaignId: string): TerminalEvent[] {
  const out: TerminalEvent[] = [];
  for (const s of sessions) {
    const named = s.name ? ` · ${s.name}` : '';
    out.push({
      id: `session-start-${s.id}`, type: 'game_event', timestamp: s.startedAt, campaignId, sessionId: s.id,
      actor: 'system', actorUserId: '', actorName: 'system',
      payload: { kind: 'game_event', eventType: 'session_start', description: `Session ${s.number} started${named}` },
    });
    if (s.endedAt) {
      out.push({
        id: `session-end-${s.id}`, type: 'game_event', timestamp: s.endedAt, campaignId, sessionId: s.id,
        actor: 'system', actorUserId: '', actorName: 'system',
        payload: { kind: 'game_event', eventType: 'session_end', description: `Session ${s.number} ended${named}` },
      });
    }
  }
  return out;
}

export function withoutLoggedSessionLines(events: TerminalEvent[]): TerminalEvent[] {
  return events.filter((e) => !(e.payload.kind === 'game_event' && (e.payload.eventType === 'session_start' || e.payload.eventType === 'session_end')));
}
