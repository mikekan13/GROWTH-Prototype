/**
 * Feed segments — the TABLE feed's reading of a character line (Mike 2026-10-07,
 * ruling-feed-segment-colours-pillars): colour marks WHAT a segment is, never
 * WHO said it.
 *
 *   ::action::   → action  (Body red bar)
 *   "speech"     → speech  (Spirit purple bar)
 *   ((thought))  → thought (Soul blue bar)
 *
 * The convention is the old AOL chat-room RP one. The engine's own act form
 * `*moves*` (table-speak actionToTableLine) reads as an action too.
 *
 * Text outside any marker takes the line's BARE kind: speech when the line has
 * no speech marks (a being's "Say:" line and a lone `Ruth: Sit down.` arrive
 * unquoted), action when it does (`She looks up. "Hi."` — the prose around the
 * quote is what she does).
 *
 * Also here, because the same rows need them: entity spans (names of things in
 * the world inside a stretch of text) and the in-world / real time pair.
 *
 * Pure, no I/O, client-safe.
 */
import { cycleToLocalDate, STANDARD_CALENDAR, daysPerLocalYear, type CalendarSpec } from '@/types/time';

export type SegmentKind = 'action' | 'speech' | 'thought';

export interface FeedSegment {
  kind: SegmentKind;
  text: string;
}

// One alternation, left to right: ::action::  ((thought))  "speech" / “speech”  *action*
const MARK_RE = /::([\s\S]+?)::|\(\(([\s\S]+?)\)\)|["“]([^"”]+)["”]|\*([^*\n]+)\*/g;
const HAS_WORD = /[\p{L}\p{N}]/u;

/** Does this line carry speech marks anywhere? */
function hasSpeechMarks(text: string): boolean {
  return /["“][^"”]+["”]/.test(text);
}

/**
 * Split a cleaned character line into pillar segments, in order. Marker
 * characters are removed (the row draws them back, dimmed). Adjacent pieces of
 * the same kind join with a space. Fragments with no letters or digits (the
 * space or comma between two marked runs) are dropped.
 */
export function parseSegments(text: string, opts: { bare?: SegmentKind } = {}): FeedSegment[] {
  const src = (text ?? '').trim();
  if (!src) return [];
  const bare: SegmentKind = opts.bare ?? (hasSpeechMarks(src) ? 'action' : 'speech');
  const out: FeedSegment[] = [];
  const push = (kind: SegmentKind, raw: string) => {
    const t = raw.replace(/\s+/g, ' ').trim();
    if (!t || !HAS_WORD.test(t)) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text = `${last.text} ${t}`;
    else out.push({ kind, text: t });
  };
  let cursor = 0;
  for (const m of src.matchAll(MARK_RE)) {
    const at = m.index ?? 0;
    push(bare, src.slice(cursor, at));
    if (m[1] !== undefined) push('action', m[1]);
    else if (m[2] !== undefined) push('thought', m[2]);
    else if (m[3] !== undefined) push('speech', m[3]);
    else if (m[4] !== undefined) push('action', m[4]);
    cursor = at + m[0].length;
  }
  push(bare, src.slice(cursor));
  return out;
}

/** The marks a segment is drawn with (open, close). */
export function segmentMarks(kind: SegmentKind): [string, string] {
  switch (kind) {
    case 'action': return ['::', '::'];
    case 'speech': return ['“', '”'];
    case 'thought': return ['((', '))'];
  }
}

// ── Entity spans ────────────────────────────────────────────────────────────

export interface EntityName { id: string; name: string }
export interface TextPiece { text: string; entityId?: string }

/** Names shorter than this are never matched (too many false hits: "Al", "Ox"). */
const MIN_ENTITY_NAME = 3;

/**
 * Cut a stretch of text into plain pieces and pieces that name a thing in the
 * world. Whole words only, case-insensitive, longest name wins where names
 * overlap ("Main Room" before "Room"). `exclude` drops ids (e.g. the row's own
 * speaker, whose chip already opens them).
 */
export function splitEntities(text: string, entities: EntityName[], exclude: Iterable<string> = []): TextPiece[] {
  if (!text) return [];
  const skip = new Set(exclude);
  const byName = new Map<string, string>();
  for (const e of entities) {
    const name = e.name?.trim();
    if (!name || name.length < MIN_ENTITY_NAME || skip.has(e.id)) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, e.id);
  }
  if (byName.size === 0) return [{ text }];
  const alts = [...byName.keys()].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(${alts.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  const out: TextPiece[] = [];
  let cursor = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > cursor) out.push({ text: text.slice(cursor, at) });
    out.push({ text: m[0], entityId: byName.get(m[0].toLowerCase()) });
    cursor = at + m[0].length;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

// ── Time: in-world first, real second (ruling-sim-advances-time 2026-10-07) ──

export interface FeedTimescale { unitsPerMetaCycle: number; calendar: CalendarSpec | null; unitName: string }

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * A campaign cycle in the calendar's presented form, short enough for a feed
 * line: "1st Jan, Y1 · 21:07 · 0.004 cyc". Without a timescale the standard
 * reckoning is used (one local year per meta cycle).
 */
export function presentCycle(cycle: number, ts?: FeedTimescale | null): string {
  const scale: FeedTimescale = ts ?? { unitsPerMetaCycle: 1, calendar: STANDARD_CALENDAR, unitName: 'year' };
  const date = cycleToLocalDate(cycle, scale);
  const cal = scale.calendar ?? STANDARD_CALENDAR;
  const years = cycle * scale.unitsPerMetaCycle;
  const dayFloat = (years - Math.floor(years)) * daysPerLocalYear(cal);
  const hoursPerDay = cal.hoursPerDay ?? 24;
  const hourFloat = (dayFloat - Math.floor(dayFloat)) * hoursPerDay;
  const hour = Math.floor(hourFloat);
  const minute = Math.min(59, Math.floor((hourFloat - hour) * 60));
  const month = date.monthName.length > 4 ? date.monthName.slice(0, 3) : date.monthName;
  const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return `${ordinal(date.day)} ${month}, Y${date.year} · ${clock} · ${cycle.toFixed(3)} cyc`;
}

/** Real time of a feed line, 24 h with seconds ("21:07:12"); '' for a bad stamp. */
export function realClock(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}
