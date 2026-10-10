/**
 * The one feed's history in FOLDABLE SECTIONS (Mike 2026-10-08: "as far as the
 * table history it will just need sections that fold away for sessions and
 * maybe like when the party sleeps or rests").
 *
 *   one section per session (its events by sessionId, else by time window)
 *   one "Between sessions" section per stretch of lines outside any session
 *   inside a session, a sub-section break at every rest the record holds
 *
 * Rests the data records: `game_event` short_rest / long_rest (POST /rest).
 * Sleep and clock advances are not recorded as feed events, so they do not
 * break a section.
 *
 * Pure.
 */
import type { TerminalEvent, GameSessionInfo, GameEventPayload } from '@/types/terminal';

const REST_TYPES = new Set(['short_rest', 'long_rest', 'rest', 'sleep']);

export function isRest(e: TerminalEvent): boolean {
  return e.payload?.kind === 'game_event' && REST_TYPES.has((e.payload as GameEventPayload).eventType);
}

export interface SectionPart {
  key: string;
  /** The rest that opens this part (null = the session's opening stretch). */
  rest: TerminalEvent | null;
  events: TerminalEvent[];
}

export interface FeedSection {
  key: string;
  kind: 'session' | 'between';
  session: GameSessionInfo | null;
  live: boolean;
  parts: SectionPart[];
  /** Lines in the section (rests are headers, not lines). */
  lines: number;
  /** Lowest and highest campaign cycle the lines carry (null = none recorded). */
  cycles: [number, number] | null;
  /** When the section starts (session start, or its first line). */
  startAt: string;
}

const t = (iso: string) => new Date(iso).getTime();

export function sessionFor(e: TerminalEvent, sessions: GameSessionInfo[]): GameSessionInfo | null {
  if (e.sessionId) {
    const s = sessions.find((x) => x.id === e.sessionId);
    if (s) return s;
  }
  const at = t(e.timestamp);
  return sessions.find((s) => t(s.startedAt) <= at && (s.endedAt === null || at <= t(s.endedAt))) ?? null;
}

/**
 * Events (oldest first) → sections, oldest first. Sessions with no loaded lines
 * still get a header when they start at or after `emptyFrom` (all of them when
 * the whole record is loaded, i.e. emptyFrom null).
 */
export function buildSections(events: TerminalEvent[], sessions: GameSessionInfo[], emptyFrom: string | null = null): FeedSection[] {
  const sections: FeedSection[] = [];
  const bySession = new Map<string, FeedSection>();
  let last: FeedSection | null = null;
  for (const e of events) {
    const s = sessionFor(e, sessions);
    let sec: FeedSection | null = s ? bySession.get(s.id) ?? null : (last && last.kind === 'between' ? last : null);
    if (!sec) {
      sec = {
        key: s ? `session-${s.id}` : `between-${e.id}`, kind: s ? 'session' : 'between', session: s, live: !!s && s.endedAt === null,
        parts: [{ key: s ? `session-${s.id}-open` : `between-${e.id}-open`, rest: null, events: [] }],
        lines: 0, cycles: null, startAt: s ? s.startedAt : e.timestamp,
      };
      sections.push(sec);
      if (s) bySession.set(s.id, sec);
    }
    last = sec;
    if (isRest(e) && sec.kind === 'session') {
      sec.parts.push({ key: `rest-${e.id}`, rest: e, events: [] });
      continue;
    }
    sec.parts[sec.parts.length - 1].events.push(e);
    sec.lines += 1;
    const c = (e.payload as { cycle?: unknown }).cycle;
    if (typeof c === 'number') sec.cycles = sec.cycles ? [Math.min(sec.cycles[0], c), Math.max(sec.cycles[1], c)] : [c, c];
  }
  const from = emptyFrom ? t(emptyFrom) : null;
  for (const s of sessions) {
    if (bySession.has(s.id) || (from !== null && t(s.startedAt) < from)) continue;
    sections.push({
      key: `session-${s.id}`, kind: 'session', session: s, live: s.endedAt === null,
      parts: [{ key: `session-${s.id}-open`, rest: null, events: [] }], lines: 0, cycles: null, startAt: s.startedAt,
    });
  }
  return sections.sort((a, b) => t(a.startAt) - t(b.startAt));
}

/** Folded unless it is the live session, or the latest stretch between sessions while none is live. */
export function openByDefault(section: FeedSection, index: number, all: FeedSection[]): boolean {
  if (section.live) return true;
  if (section.kind === 'between') return index === all.length - 1 && !all.some((s) => s.live);
  return false;
}
