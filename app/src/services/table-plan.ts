/**
 * Table plan — what a stretch of table talk DOES, once table-talk.ts has said
 * what it IS (U2c, TABLE-RHYTHM-DESIGN-2026-10-01 §1).
 *
 *   world content (narration, results, speech)  → the beings LISTEN to it
 *   the GM handing over the turn                → the beings asked ANSWER
 *   speech that expects a reply                 → those spoken to ANSWER,
 *                                                 everyone else hears it
 *   out-of-character talk and check calls       → nobody hears them, and they
 *                                                 never become canon
 *
 * A false "out of character" silently deletes the GM's words from the world,
 * so SPOKEN talk is dropped only on the sure rules; anything the detector
 * merely guessed at is kept as narration. Typed talk is dropped on any of the
 * rules, and the caller lists what was dropped back to the GM.
 *
 * Pure functions, no I/O — unit-tested on their own.
 */
import type { ProseRosterEntry } from './table-prose';
import { addressees, type TableUtterance } from './table-talk';

export type TableBeat =
  /** A run of world content, heard together. */
  | { type: 'hear'; utterances: TableUtterance[] }
  /** The GM hands the turn over ("What do you do?", a name). */
  | { type: 'turn'; utterance: TableUtterance }
  /** Speech that expects a reply: direct address, or a question thrown to the room. */
  | { type: 'spoken'; utterance: TableUtterance };

export interface TablePlan {
  beats: TableBeat[];
  /** Out-of-character talk and check calls: not heard, not canon. */
  ignored: TableUtterance[];
  /** Everything that happens in the world, in order (the content of the hear and spoken beats). */
  world: TableUtterance[];
}

/** Structurally the stimulus the being loop takes; declared here so this file stays free of server imports. */
export interface PlannedStimulus {
  source: 'perception' | 'dialogue';
  content: string;
}

/** The out-of-character rules that are safe to act on when the words were spoken, not typed. */
const SURE_OOC_RULES = new Set(['ooc:prefix', 'ooc:wrapped']);

export function planTableTalk(utterances: TableUtterance[], mode: 'typed' | 'spoken'): TablePlan {
  const beats: TableBeat[] = [];
  const ignored: TableUtterance[] = [];
  const world: TableUtterance[] = [];
  let run: TableUtterance[] = [];
  const closeRun = () => { if (run.length) { beats.push({ type: 'hear', utterances: run }); run = []; } };

  for (const utterance of utterances) {
    const kept: TableUtterance = utterance.kind === 'ooc' && mode === 'spoken' && !SURE_OOC_RULES.has(utterance.rule)
      ? { ...utterance, kind: 'narration', rule: `${utterance.rule}→kept-as-narration` }
      : utterance;
    switch (kept.kind) {
      case 'ooc':
      case 'check-call':
        ignored.push(kept);
        break;
      case 'ask-to-party':
      case 'ask-to-name':
        closeRun();
        beats.push({ type: 'turn', utterance: kept });
        break;
      case 'dialogue':
        world.push(kept);
        if (kept.expectsReply) { closeRun(); beats.push({ type: 'spoken', utterance: kept }); }
        else run.push(kept);
        break;
      default: // narration, result
        world.push(kept);
        run.push(kept);
    }
  }
  closeRun();
  return { beats, ignored, world };
}

function spokenLine(utterance: TableUtterance): string {
  return `${utterance.speaker?.label ?? 'someone present'}: ${utterance.text}`;
}

/**
 * What one listener is handed for a run: narration as written, speech as
 * `Speaker: words`. A being is never handed its own line as something heard.
 * Narration anywhere in the run makes the whole a perception. Null = nothing
 * in the run is for this listener.
 */
export function stimulusFor(run: TableUtterance[], listenerId: string): PlannedStimulus | null {
  const mine = run.filter((u) => !(u.kind === 'dialogue' && u.speaker?.id === listenerId));
  if (!mine.length) return null;
  return {
    source: mine.some((u) => u.kind !== 'dialogue') ? 'perception' : 'dialogue',
    content: mine.map((u) => (u.kind === 'dialogue' ? spokenLine(u) : u.text)).join('\n'),
  };
}

/** Who answers a turn or a spoken line, out of the beings listening. */
export function answerers(beat: Extract<TableBeat, { type: 'turn' | 'spoken' }>, listeners: ProseRosterEntry[]): string[] {
  return addressees(beat.utterance, listeners);
}

/** Who merely hears a spoken line: every listener it was not aimed at, bar the speaker. */
export function overhearers(beat: Extract<TableBeat, { type: 'spoken' }>, listeners: ProseRosterEntry[]): string[] {
  const answering = new Set(answerers(beat, listeners));
  return listeners.map((l) => l.id).filter((id) => !answering.has(id) && id !== beat.utterance.speaker?.id);
}

/**
 * The narration that goes on the record. With nothing ignored it is the GM's
 * text exactly as given; otherwise it is rebuilt from what happened in the
 * world, leaving out what was ignored and the GM's asks. Null = nothing in the
 * message happened in the world (only an ask, or only ignored talk).
 */
export function canonNarration(full: string, plan: TablePlan): string | null {
  if (!plan.world.length) return null;
  if (!plan.ignored.length) return full;
  return plan.world.map((u) => (u.kind === 'dialogue' ? `${u.speaker?.label ?? 'someone present'}: "${u.text}"` : u.text)).join(' ');
}
