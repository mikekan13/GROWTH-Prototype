/**
 * TABLE feed rows — what each logged event looks like at the table, in the row
 * grammar of ruling-feed-segment-colours-pillars (Mike 2026-10-07) and the
 * feed-grammar sheet (tmp/screens/2026-10-07-feed-grammar-sheet.html).
 *
 *   character  chip + pillar bars (PC / NPC / being, typed, spoken, or pulled
 *              out of the Watcher's narration by the preprocessor)
 *   narration  the manual's clean reading text, no label, no chip
 *   check      Terminal assessment bar (p 63)
 *   event      black consequence bar with a [CAPS] tag (pp 130-137)
 *   jewl       [jEWL]: margin voice on the grey bar (p 70)
 *   system     teal stream readout (p 2)
 *   withdrawn  struck through + coral Bebas correction (p 63)
 *   beat       spoken sentences of one beat, folded (pp 131/136)
 *
 * Pure: events in, row models out. Rows written before 2026-10-07 carry no
 * feed fields (types/terminal TableFeedFields); they fall back to reading the
 * text with the same preprocessor the engine uses (services/table-prose, pure).
 */
import type {
  TerminalEvent, ChatPayload, GameEventPayload, DiceRollPayload, CommandPayload, AIMessagePayload, ChangeLogPayload,
} from '@/types/terminal';
import { parseSegments, type FeedSegment } from '@/lib/feed-segments';
import { parseTableProse } from '@/services/table-prose';
import { foldSpokenBeats } from '../SpokenBeatBlock';

export type Via = 'typed' | 'spoken' | 'being';
/** Who voiced the line: the Watcher, a Trailblazer, or the being itself (DAYA). */
export type Voice = 'Watcher' | 'Trailblazer' | 'Being';

interface RowBase {
  key: string;
  timestamp: string;
  /** Campaign cycle when recorded (absent on rows written before 2026-10-07). */
  cycle?: number;
}

export interface CharacterRowModel extends RowBase {
  type: 'character';
  characterId: string | null;
  name: string;
  segments: FeedSegment[];
  raw: string;
  via: Via;
  voice: Voice;
  /** The account that voiced it (username), when a person did. */
  voicedBy: string | null;
  /** Pulled out of a Watcher utterance by the preprocessor. */
  fromNarration: boolean;
}

export interface NarrationRowModel extends RowBase {
  type: 'narration';
  text: string;
  raw: string;
  via: Via;
  voicedBy: string | null;
}

export interface BarRowModel extends RowBase {
  type: 'check' | 'event' | 'jewl' | 'system';
  /** One bar per line. */
  lines: string[];
  /** Bracketed lead tag ("[ENCOUNTER ROUND]", "[jEWL]:"). */
  tag?: string;
  /** A character change that can still be reverted: its changelog entry id. */
  revertId?: string;
}

export interface WithdrawnRowModel extends RowBase {
  type: 'withdrawn';
  text: string;
  fix: string;
}

export interface BeatRowModel extends RowBase {
  type: 'beat';
  beatId: string;
  /** One group of rows per spoken sentence, in order. */
  groups: Array<Array<NarrationRowModel | CharacterRowModel>>;
  lastTimestamp: string;
}

export type FeedRowModel = CharacterRowModel | NarrationRowModel | BarRowModel | WithdrawnRowModel | BeatRowModel;

export interface RosterName { id: string; name: string }

function voiceOf(actor: TerminalEvent['actor']): Voice {
  if (actor === 'player') return 'Trailblazer';
  if (actor === 'ai_copilot') return 'Being';
  return 'Watcher';
}

function caps(s: string): string {
  return s.replace(/_/g, ' ').toUpperCase();
}

/** A declaration (the Watcher's narration) → a narration row and one character row per line of speech in it. */
function declarationRows(e: TerminalEvent, p: GameEventPayload, roster: RosterName[]): Array<NarrationRowModel | CharacterRowModel> {
  const via: Via = p.via ?? (p.beatId ? 'spoken' : 'typed');
  const raw = p.raw ?? p.description;
  let narration: string | null;
  let speech: Array<{ speakerId: string | null; speakerLabel: string; text: string }>;
  if (Array.isArray(p.speech)) {
    speech = p.speech;
    narration = p.narration !== undefined ? p.narration : (speech.length ? null : p.description);
  } else {
    const parsed = parseTableProse(p.description, roster);
    speech = parsed.quotes;
    narration = parsed.narration;
  }
  const rows: Array<NarrationRowModel | CharacterRowModel> = [];
  if (narration && narration.trim()) {
    rows.push({ type: 'narration', key: e.id, timestamp: e.timestamp, cycle: p.cycle, text: narration.trim(), raw, via, voicedBy: e.actorName || null });
  }
  speech.forEach((s, i) => {
    rows.push({
      type: 'character', key: `${e.id}#${i}`, timestamp: e.timestamp, cycle: p.cycle,
      characterId: s.speakerId, name: s.speakerLabel, segments: [{ kind: 'speech', text: s.text }],
      raw, via, voice: 'Watcher', voicedBy: e.actorName || null, fromNarration: true,
    });
  });
  if (rows.length === 0 && p.description.trim()) {
    rows.push({ type: 'narration', key: e.id, timestamp: e.timestamp, cycle: p.cycle, text: p.description.trim(), raw, via, voicedBy: e.actorName || null });
  }
  return rows;
}

function chatRow(e: TerminalEvent, p: ChatPayload): FeedRowModel | null {
  const message = p.message?.trim();
  if (!message) return null;
  const voice = voiceOf(e.actor);
  const via: Via = p.via ?? (e.actor === 'ai_copilot' ? 'being' : 'typed');
  const raw = p.raw ?? p.message;
  if (!e.characterId && e.actor === 'gm') {
    return { type: 'narration', key: e.id, timestamp: e.timestamp, cycle: p.cycle, text: message, raw, via, voicedBy: e.actorName || null };
  }
  if (!e.characterId && e.actor === 'ai_copilot') {
    return { type: 'jewl', key: e.id, timestamp: e.timestamp, cycle: p.cycle, lines: [message], tag: '[jEWL]:' };
  }
  return {
    type: 'character', key: e.id, timestamp: e.timestamp, cycle: p.cycle,
    characterId: e.characterId ?? null, name: e.characterName || e.actorName || 'someone present',
    segments: parseSegments(message), raw, via, voice,
    voicedBy: voice === 'Being' ? null : (e.actorName || null), fromNarration: false,
  };
}

function diceRow(e: TerminalEvent, p: DiceRollPayload): BarRowModel {
  const who = e.characterName ? `${e.characterName} · ` : '';
  const verdict = p.success === true ? ' · PASS' : p.success === false ? ' · FAIL' : '';
  const vs = p.dr !== undefined ? ` vs DR ${p.dr}` : '';
  return { type: 'check', key: e.id, timestamp: e.timestamp, lines: [`${who}${p.context}`, `rolled ${p.total}${vs}${verdict}`] };
}

function gameEventRow(e: TerminalEvent, p: GameEventPayload): FeedRowModel | null {
  const text = p.description?.trim();
  if (!text || !p.eventType) return null;
  if (p.eventType === 'session_start' || p.eventType === 'session_end') {
    return { type: 'system', key: e.id, timestamp: e.timestamp, cycle: p.cycle, lines: [`[${text.toUpperCase()}]`] };
  }
  if (p.eventType.startsWith('skill_')) {
    return { type: 'check', key: e.id, timestamp: e.timestamp, cycle: p.cycle, lines: [text] };
  }
  return { type: 'event', key: e.id, timestamp: e.timestamp, cycle: p.cycle, tag: `[${caps(p.eventType)}]`, lines: [text] };
}

/** One event → its rows (none for kinds the table does not show). */
export function eventRows(e: TerminalEvent, roster: RosterName[]): FeedRowModel[] {
  const p = e.payload;
  switch (p?.kind) {
    case 'chat': { const r = chatRow(e, p); return r ? [r] : []; }
    case 'game_event':
      if (p.eventType === 'declaration' && p.description?.trim()) return declarationRows(e, p, roster);
      { const r = gameEventRow(e, p); return r ? [r] : []; }
    case 'dice_roll': return [diceRow(e, p as DiceRollPayload)];
    case 'command': {
      const c = p as CommandPayload;
      return [{ type: 'system', key: e.id, timestamp: e.timestamp, lines: [`> ${c.input}`, ...(c.result ? c.result.split('\n') : [])] }];
    }
    case 'ai_message': return [{ type: 'jewl', key: e.id, timestamp: e.timestamp, tag: '[jEWL]:', lines: [(p as AIMessagePayload).message] }];
    case 'changelog': {
      const c = p as ChangeLogPayload;
      const who = e.characterName ? `${e.characterName} · ` : '';
      if (c.reverted) return [{ type: 'withdrawn', key: e.id, timestamp: e.timestamp, text: `${who}${c.description}`, fix: 'REVERTED' }];
      return [{ type: 'system', key: e.id, timestamp: e.timestamp, lines: [`[CHANGE] ${who}${c.description}`], ...(c.revertible ? { revertId: c.entryId } : {}) }];
    }
    default: return [];
  }
}

/**
 * The whole feed. Spoken declarations of one beat fold into one beat row
 * (the same grouping as SpokenBeatBlock: consecutive rows sharing payload.beatId).
 */
export function buildFeedRows(events: TerminalEvent[], roster: RosterName[] = []): FeedRowModel[] {
  const out: FeedRowModel[] = [];
  for (const row of foldSpokenBeats(events)) {
    if (row.kind === 'event') { out.push(...eventRows(row.event, roster)); continue; }
    const groups = row.events.map((ev) => eventRows(ev, roster) as Array<NarrationRowModel | CharacterRowModel>).filter((g) => g.length > 0);
    if (groups.length === 0) continue;
    if (groups.length === 1) { out.push(...groups[0]); continue; }
    const first = row.events[0];
    out.push({
      type: 'beat', key: `beat-${row.beatId}-${first.id}`, beatId: row.beatId, timestamp: first.timestamp,
      lastTimestamp: row.events[row.events.length - 1].timestamp, groups,
      cycle: (first.payload as GameEventPayload).cycle,
    });
  }
  return out;
}
