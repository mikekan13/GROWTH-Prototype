/**
 * The drawer's two records (Mike 2026-10-08):
 *
 *   Terminal tab — NARRATIVE ONLY, and only play: lines inside sessions.
 *   jEWL tab Log — the MECHANICS (changelog, checks, item / location / KRMA /
 *                  planning rows) from everywhere, plus everything that happened
 *                  between sessions (out-of-play setup and planning).
 *
 * The common mechanical kinds still read in the feed as one numberless line
 * (mechanical-narration.ts); every mechanical row hangs behind a feed line
 * (its own narrated line, else the line before it in the same session), and
 * that line carries a link to it in the Log (`logRefs`).
 *
 * Visibility: both records are cut from the same loaded events — nothing here
 * fetches more. KRMA rows are the Watcher's only (`krma` is dropped for others).
 *
 * Pure.
 */
import type { TerminalEvent, GameSessionInfo } from '@/types/terminal';
import { sessionFor } from './feed-sections';
import { narrateMechanical } from './mechanical-narration';

export type LogKind = 'stats' | 'location' | 'items' | 'krma' | 'planning' | 'checks';
export const LOG_KINDS: Array<{ kind: LogKind; label: string }> = [
  { kind: 'stats', label: 'Stats' },
  { kind: 'location', label: 'Location' },
  { kind: 'items', label: 'Items' },
  { kind: 'krma', label: 'KRMA' },
  { kind: 'planning', label: 'Planning' },
  { kind: 'checks', label: 'Checks' },
];

const LOCATION_TYPES = new Set(['relocation', 'moved', 'located_at', 'arrival', 'departure']);
const ITEM_TYPES = new Set(['item_moved', 'item_given', 'item_taken', 'item_dropped']);

/** The Log kind of a mechanical row; null = a narrative line. */
export function mechanicalKind(e: TerminalEvent): LogKind | null {
  const p = (e.payload ?? {}) as unknown as Record<string, unknown>;
  if (p.subtype === 'crystallization') return 'krma';
  switch (p.kind) {
    case 'changelog':
      return p.category === 'inventory' || p.category === 'equipment' ? 'items' : 'stats';
    case 'dice_roll':
    case 'command':
      return 'checks';
    case 'game_event': {
      const et = typeof p.eventType === 'string' ? p.eventType : '';
      if (LOCATION_TYPES.has(et)) return 'location';
      if (ITEM_TYPES.has(et)) return 'items';
      if (et.startsWith('skill_')) return 'checks';
      if (et.startsWith('krma_')) return 'krma';
      if (et.startsWith('opportunity_') || et.startsWith('planning')) return 'planning';
      return null;
    }
    default:
      return null;
  }
}

const NARRATED = 'narrated';
export const narratedId = (sourceId: string) => `nar-${sourceId}`;

/** A narrated line made from a mechanical row (rendered as narration; never written anywhere). */
export function isNarratedLine(e: TerminalEvent): boolean {
  return e.payload?.kind === 'game_event' && (e.payload as { eventType?: string }).eventType === NARRATED;
}

/**
 * Events (oldest first) → the same events with a narrated line after every
 * mapped mechanical row, and the log links: feed line id → mechanical ids
 * behind it. Only rows inside a session are linked (between-session rows
 * live in the Log alone).
 */
export function withNarration(events: TerminalEvent[], sessions: GameSessionInfo[]): { events: TerminalEvent[]; logRefs: Map<string, string[]> } {
  const out: TerminalEvent[] = [];
  const logRefs = new Map<string, string[]>();
  const link = (lineId: string, mechId: string) => { const a = logRefs.get(lineId); if (a) a.push(mechId); else logRefs.set(lineId, [mechId]); };
  let lastLine: { id: string; session: string } | null = null;
  for (const e of events) {
    const s = sessionFor(e, sessions);
    out.push(e);
    const kind = mechanicalKind(e);
    if (kind === null) {
      if (s) lastLine = { id: e.id, session: s.id };
      continue;
    }
    if (!s) continue;
    const text = narrateMechanical(e);
    if (text) {
      const id = narratedId(e.id);
      out.push({
        id, type: 'game_event', timestamp: e.timestamp, campaignId: e.campaignId,
        actor: 'system', actorUserId: e.actorUserId, actorName: 'System',
        characterId: e.characterId, characterName: e.characterName, sessionId: e.sessionId ?? s.id,
        payload: { kind: 'game_event', eventType: NARRATED, description: text, ...(typeof (e.payload as { cycle?: unknown }).cycle === 'number' ? { cycle: (e.payload as { cycle: number }).cycle } : {}) },
      } as TerminalEvent);
      link(id, e.id);
      lastLine = { id, session: s.id };
      continue;
    }
    if (lastLine && lastLine.session === s.id) link(lastLine.id, e.id);
  }
  return { events: out, logRefs };
}

/** The Terminal feed keeps narrative lines (narrated ones included), never mechanics. */
export function feedKeep(e: TerminalEvent): boolean {
  return mechanicalKind(e) === null;
}

export interface LogFilter {
  kinds: Set<LogKind>;
  characterId: string | null;
  /** The Watcher sees KRMA rows; nobody else does. */
  isGM: boolean;
}

/** The Log keeps every mechanical row, and everything between sessions; filters narrow it. */
export function logKeep(e: TerminalEvent, where: 'session' | 'between', f: LogFilter): boolean {
  if (isNarratedLine(e)) return false;
  const kind = mechanicalKind(e);
  if (kind === 'krma' && !f.isGM) return false;
  if (kind === null && where !== 'between') return false;
  if (f.kinds.size > 0 && (kind === null || !f.kinds.has(kind))) return false;
  if (f.characterId && e.characterId !== f.characterId) return false;
  return true;
}

/** Characters the loaded mechanical rows name, for the Log's character filter. */
export function logCharacters(events: TerminalEvent[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const e of events) {
    if (e.characterId && !seen.has(e.characterId)) seen.set(e.characterId, e.characterName || e.characterId);
  }
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Search hits the Terminal feed can show: narrative lines inside sessions. */
export function isFeedLine(e: TerminalEvent, sessions: GameSessionInfo[]): boolean {
  return feedKeep(e) && !!sessionFor(e, sessions);
}
