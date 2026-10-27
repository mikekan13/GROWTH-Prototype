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
  TerminalEvent, ChatPayload, GameEventPayload, DiceRollPayload, CommandPayload, AIMessagePayload, ChangeLogPayload, RollPayload,
} from '@/types/terminal';
import { chosenNote, HINT_WORD } from '@/lib/roll-card';
import { parseSegments, mergeAdjacent, type FeedSegment } from '@/lib/feed-segments';
import { parseTableProse, characterCards } from '@/services/table-prose';
import { foldSpokenBeats } from '../SpokenBeatBlock';

export type Via = 'typed' | 'spoken' | 'being';
/** Who voiced the line: the Watcher, a Trailblazer, or the being itself (DAYA). */
export type Voice = 'Watcher' | 'Trailblazer' | 'Being';

interface RowBase {
  key: string;
  timestamp: string;
  /** Campaign cycle when recorded (absent on rows written before 2026-10-07). */
  cycle?: number;
  /** Mechanical rows behind this line, in the jEWL tab's Log (feed-split.ts). */
  logRefs?: string[];
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
  /** Told from a mechanical row (feed-split.ts) — no raw text behind it; the Log holds the numbers. */
  mechanical?: boolean;
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

/**
 * A ROLL CARD (Mike 2026-10-26): the event sentence, then the readout bars, cut to what this viewer perceived —
 * 'watcher' sees everything (DR included), 'full' the readout, 'event' only the sentence. Never the DR for a player.
 */
export interface RollRowModel extends RowBase {
  type: 'roll';
  rollId: string;
  level: 'watcher' | 'full' | 'event';
  event: string;
  actorId: string;
  actorName: string;
  /** Readout bars, one per line (empty at level 'event'). */
  lines: string[];
  /** 'PASS' | 'FAIL' for a readout that shows the result. */
  result: 'PASS' | 'FAIL' | null;
  /** How the Effort was chosen, when not by the owner's hand. */
  note: string | null;
  /** For the novel: the skill when the actor had one (not at 'event'), the Effort spent, whether it worked (null at 'event'). */
  skill: string | null;
  effort: number;
  success: boolean | null;
}

export type FeedRowModel = CharacterRowModel | NarrationRowModel | BarRowModel | WithdrawnRowModel | BeatRowModel | RollRowModel;

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
  let actions: Array<{ actorId: string; actorLabel: string; text: string; sentence?: string }>;
  let thoughts: Array<{ actorId: string; actorLabel: string; text: string; sentence?: string }>;
  if (Array.isArray(p.speech)) {
    speech = p.speech;
    actions = Array.isArray(p.actions) ? p.actions : [];
    thoughts = Array.isArray(p.thoughts) ? p.thoughts : [];
    narration = p.narration !== undefined ? p.narration : (speech.length || actions.length || thoughts.length ? null : p.description);
  } else {
    const parsed = parseTableProse(p.description, roster);
    speech = parsed.quotes;
    actions = parsed.actions ?? [];
    thoughts = parsed.thoughts ?? [];
    narration = parsed.narration;
  }
  const rows: Array<NarrationRowModel | CharacterRowModel> = [];
  if (narration && narration.trim()) {
    rows.push({ type: 'narration', key: e.id, timestamp: e.timestamp, cycle: p.cycle, text: narration.trim(), raw, via, voicedBy: e.actorName || null });
  }
  // ONE card per character: its acts (Body red), thoughts (Soul blue) and words (Spirit purple) in the order the
  // Watcher wrote them (Mike 2026-10-25: "one Kristopher card that had his actions and thoughts all in one card").
  characterCards(p.description, { narration, speech, actions, thoughts }).forEach((card, i) => {
    rows.push({
      type: 'character', key: `${e.id}#c${i}`, timestamp: e.timestamp, cycle: p.cycle,
      characterId: card.id, name: card.label, segments: mergeAdjacent(card.segments.map((s): FeedSegment => ({ kind: s.kind, text: s.text }))),
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

const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A roll payload (already cut to its reader by the server) -> its card. Pure. */
export function rollRow(e: TerminalEvent, p: RollPayload): RollRowModel | null {
  const level: RollRowModel['level'] = p.view === 'event' ? 'event' : p.view === 'watcher' ? 'watcher' : 'full';
  const base = { type: 'roll' as const, key: e.id, timestamp: e.timestamp, cycle: p.cycle, rollId: p.rollId, level, event: p.event, actorId: p.actorId, actorName: p.actorName };
  if (!p.event?.trim()) return null;
  if (level === 'event') return { ...base, lines: [], result: null, note: null, skill: null, effort: 0, success: null };
  const skill = p.isSkilled && p.skillName ? p.skillName : `${cap1(p.governor)} (unskilled)`;
  const sd = p.sd ? `SD ${p.sd.die.startsWith('flat') ? `+${p.sd.value}` : `${p.sd.die} ${p.sd.value}`}${p.hint ? ` (${HINT_WORD[p.hint]})` : ''}` : null;
  const effort = `Effort ${p.effort}${p.effort && p.effortAttribute ? ` (${p.effortAttribute})` : ''}`;
  const fd = p.fd ? `FD ${p.fd.die} ${p.fd.value}` : null;
  const flat = p.traitFlat ? `traits ${p.traitFlat > 0 ? '+' : ''}${p.traitFlat}` : null;
  const result: 'PASS' | 'FAIL' = p.success ? 'PASS' : 'FAIL';
  const lines = [
    `${p.actorName} · ${skill}`,
    [sd, effort, fd, flat].filter(Boolean).join(' · '),
    `total ${p.total}${level === 'watcher' && p.dr !== undefined ? ` vs DR ${p.dr}` : ''} · ${result}${p.margin !== undefined ? ` (${p.margin >= 0 ? '+' : ''}${p.margin})` : ''}`,
  ];
  if (level === 'watcher' && p.dr !== undefined) lines.push(p.drBy === 'sim' ? 'DR suggested by the sim' : 'DR set by the Watcher');
  return { ...base, lines, result, note: chosenNote(p), skill: p.isSkilled && p.skillName ? p.skillName : null, effort: p.effort, success: p.success };
}

function gameEventRow(e: TerminalEvent, p: GameEventPayload): FeedRowModel | null {
  const text = p.description?.trim();
  if (!text || !p.eventType) return null;
  if (p.eventType === 'narrated') {
    return { type: 'narration', key: e.id, timestamp: e.timestamp, cycle: p.cycle, text, raw: text, via: 'typed', voicedBy: null, mechanical: true };
  }
  if (p.eventType === 'session_start' || p.eventType === 'session_end') {
    return { type: 'system', key: e.id, timestamp: e.timestamp, cycle: p.cycle, lines: [`[${text.toUpperCase()}]`] };
  }
  if (p.eventType === 'genesis_report') {
    // JEWL's full genesis cycle report (Log only): first line = who · cycle.
    const [head, ...body] = text.split('\n');
    return { type: 'event', key: e.id, timestamp: e.timestamp, cycle: p.cycle, tag: `[GENESIS · ${head}]`, lines: body.length ? body : [head] };
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
    case 'roll': { const r = rollRow(e, p as RollPayload); return r ? [r] : []; }
    case 'command': {
      const c = p as CommandPayload;
      return [{ type: 'system', key: e.id, timestamp: e.timestamp, lines: [`> ${c.input}`, ...(c.result ? c.result.split('\n') : [])] }];
    }
    case 'ai_message': return [{ type: 'jewl', key: e.id, timestamp: e.timestamp, tag: '[jEWL]:', lines: [(p as AIMessagePayload).message] }];
    // What went through a being while someone else had the floor: its ((thought)) row, Soul blue — the record
    // reads like a novel (Mike 2026-10-25), and a thought is in it. Only the Watcher and the being itself get these rows.
    case 'being_thought': {
      const bp = p as { thought?: string; cycle?: number; scene?: string | null; segments?: Array<{ kind: FeedSegment['kind']; text: string }> };
      const t = bp.thought?.trim();
      if (!t && !bp.segments?.length) return [];
      const rows: FeedRowModel[] = [];
      // Built up (scene-builder 2026-10-25): a prose line setting the being's side of the scene, then its card —
      // thoughts blue, what it did red, what it said purple.
      if (bp.scene?.trim()) rows.push({ type: 'narration', key: `${e.id}#scene`, timestamp: e.timestamp, cycle: bp.cycle, text: bp.scene.trim(), raw: bp.scene.trim(), via: 'being', voicedBy: null });
      const segments: FeedSegment[] = bp.segments?.length ? mergeAdjacent(bp.segments.map((s) => ({ kind: s.kind, text: s.text }))) : [{ kind: 'thought', text: t! }];
      rows.push({
        type: 'character', key: e.id, timestamp: e.timestamp, cycle: bp.cycle,
        characterId: e.characterId ?? null, name: e.characterName || 'someone present', segments,
        raw: t || segments.map((s) => s.text).join(' '), via: 'being', voice: 'Being', voicedBy: null, fromNarration: false,
      });
      return rows;
    }
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
export function buildFeedRows(events: TerminalEvent[], roster: RosterName[] = [], logRefs?: Map<string, string[]>): FeedRowModel[] {
  const out: FeedRowModel[] = [];
  /** The first row of an event carries its log link. */
  const rowsOf = (ev: TerminalEvent) => {
    const rows = eventRows(ev, roster);
    const refs = logRefs?.get(ev.id);
    if (refs && rows.length) rows[0] = { ...rows[0], logRefs: refs };
    return rows;
  };
  for (const row of foldSpokenBeats(events)) {
    if (row.kind === 'event') { out.push(...rowsOf(row.event)); continue; }
    const groups = row.events.map((ev) => rowsOf(ev) as Array<NarrationRowModel | CharacterRowModel>).filter((g) => g.length > 0);
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
