/**
 * THE TABLE TEST — the shape of one replayed session, as the asserts read it (GROUNDED-BEATS-PLAN-2026-11-03 §4).
 *
 * A run plays a script (the Watcher's lines, in order) against a live server on a restored world, then gathers everything the
 * table wrote: the rows, each being's cards with the PIECES that made them, the ledger after every line, and the server log.
 * The asserts (asserts.ts) are pure functions over this shape. Rules, never golden prose.
 */

export interface ScriptStep {
  /** The Watcher's line, as typed. */
  line: string;
  /** Seconds the Watcher waits after it (the table's pace). */
  waitS: number;
  /** Who typed it: Michael's own line from the record, or a Claude-written variant in another GM's voice. */
  voice?: 'michael' | 'terse' | 'paragraph' | 'past' | 'npc' | 'thumbs' | 'question' | 'contradiction' | 'skip';
}

export interface TableScript {
  name: string;
  /** The world to restore before the run: a snapshot file and the ISO time the record is cut from. */
  world: { snapshot: string; from: string };
  steps: ScriptStep[];
}

/** A row the table wrote, in order. */
export interface RunEvent {
  at: number;            // ms epoch
  type: string;          // campaignEvent.type: game_event | being_thought | chat | …
  eventType?: string;    // payload.eventType for game_event: declaration | session_start | …
  characterId?: string | null;
  characterName?: string | null;
  sessionId?: string | null;
  text: string;          // description | message | thought, whitespace-folded
  narration?: string | null;
  payload: Record<string, unknown>;
}

/** The pieces the composer held when it made a card (stored on the being_thought payload as `pieces`). */
export interface BeatPieces {
  /** Joins the card to its orders and choice in the training log. */
  beatKey?: string;
  perceived: string;
  felt: string;
  wakes: Array<{ text: string; why: string }>;
  recent: string[];
  gist: string;
  impulse: 'speak' | 'act' | 'stay';
  why?: string;
  /** The session the recent thoughts were drawn from, when known. */
  recentSessionId?: string | null;
}

export interface RunCard {
  at: number;
  lineIndex: number;              // which script step this card answered (−1 when before the first)
  characterId: string;
  characterName: string;
  segments: Array<{ kind: 'thought' | 'speech' | 'action' | string; text: string }>;
  thought: string;                // the raw thought the card was built from
  pieces?: BeatPieces;
  msAfterLine: number;            // card time − the line's time
}

export interface LedgerItem { id: string; name: string; holderId: string | null; locationId: string | null; status: string; signal?: { text: string; since: number; until: number; by: string } | null }
export interface LedgerBeing { characterId: string; name: string; locationId: string | null }

/** The ledger as it stood right after a line was played (and settled). */
export interface LedgerAt {
  lineIndex: number;
  at: number;
  items: LedgerItem[];
  beings: LedgerBeing[];
}

export interface WallCall { at: number; caller: string; lane: string; bytesIn: number; namesSwapped?: number; strayPlaceholders?: number }

export interface RunTranscript {
  script: TableScript;
  sessionId: string | null;
  startedAt: number;
  endedAt: number;
  /** The line times, in step order. */
  lineAt: number[];
  /** Each line's HTTP outcome: status, whether the table withheld it (a note to the Watcher), the note text. */
  lineResults: Array<{ status: number; withheld: boolean; note?: string; body: string }>;
  events: RunEvent[];
  cards: RunCard[];
  ledger: LedgerAt[];
  /** Memories each being wrote during the run. */
  memories: Array<{ characterId: string; characterName: string; source: string; content: string; at: number }>;
  /** Every cloud call the wall logged during the run. */
  wall: WallCall[];
  /** The server log slice for the run, raw lines. */
  log: string[];
  /** Who is who: the campaign roster and what each being has memories of (names), for the people-assert. */
  roster: Array<{ characterId: string; name: string; knownNames: string[] }>;
}

export interface AssertResult {
  id: string;
  title: string;
  pass: boolean;
  /** Evidence lines: what failed, where (card time, being, the sentence). Empty on pass. */
  evidence: string[];
  /** A number the report can trend (ms, bytes, count), when the assert measures something. */
  measure?: { label: string; value: number };
}
