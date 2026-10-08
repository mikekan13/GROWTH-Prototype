/**
 * Campaign Terminal — Type Definitions
 *
 * The Campaign Terminal is the unified activity feed for a campaign session.
 * All events (changelogs, dice rolls, chat, commands, AI, game events) flow
 * through a single TerminalEvent type for display and persistence.
 */

import type { ChangeCategory, FieldChange } from './changelog';

// ── Event Types ────────────────────────────────────────────────────────────

export type TerminalEventType =
  | 'changelog'      // Character state changes (from existing ChangeLog system)
  | 'dice_roll'      // Dice roll results
  | 'chat'           // Player/GM messages
  | 'command'        // Command execution + result
  | 'ai_message'     // AI copilot messages (future)
  | 'game_event';    // Narrative/system events (session start, combat begin, etc.)

export type TerminalActor = 'player' | 'gm' | 'ai_copilot' | 'system';

// ── Payloads ───────────────────────────────────────────────────────────────

export interface ChangeLogPayload {
  kind: 'changelog';
  entryId: string;
  category: ChangeCategory;
  description: string;
  changes: FieldChange[];
  source: string | null;
  revertible: boolean;
  reverted: boolean;
}

export interface DiceRollPayload {
  kind: 'dice_roll';
  context: string;               // "Persuasion check" or "Fate Die"
  skillName?: string;
  skillLevel?: number;
  skillDie?: { die: string; value: number; isFlat: boolean };
  fateDie: { die: string; value: number };
  effort?: number;
  effortAttribute?: string;
  flatModifiers?: number;
  total: number;
  dr?: number;
  success?: boolean;
  margin?: number;
  isSkilled: boolean;
  /** Raw dice for physical rolls — used to color min/max values in the log */
  physicalDice?: Array<{ dieType: string; value: number }>;
}

/**
 * What the TABLE feed needs to draw a line the way the ruling says
 * (ruling-feed-segment-colours-pillars, 2026-10-07). All optional: rows written
 * before 2026-10-07 have none of it and the feed falls back.
 */
export interface TableFeedFields {
  /** How the line reached the table: typed by a person, spoken into the mic, or answered by a being (DAYA). */
  via?: 'typed' | 'spoken' | 'being';
  /** The campaign clock (meta cycles) when the line was recorded — the in-world time shown before the real one. */
  cycle?: number;
  /** The pre-processed text, exactly as typed or transcribed, when it differs from the cleaned text. */
  raw?: string;
}

export interface ChatPayload extends TableFeedFields {
  kind: 'chat';
  message: string;
}

export interface CommandPayload {
  kind: 'command';
  input: string;
  result: string;
  success: boolean;
}

export interface AIMessagePayload {
  kind: 'ai_message';
  message: string;
  severity: 'info' | 'warning' | 'action' | 'question';
  actionTaken?: string;
  requiresConfirmation?: boolean;
}

export interface GameEventPayload extends TableFeedFields {
  kind: 'game_event';
  eventType: string;             // "session_start", "session_end", "combat_begin", etc.
  description: string;
  /** Spoken narration is recorded sentence by sentence (U2c, Mike 2026-10-06); rows of one beat share this id so the feed can read them as one. */
  beatId?: string;
  /** A table declaration's split, as the preprocessor (table-prose) made it: the pure narration (null = the message was speech alone)… */
  narration?: string | null;
  /** …and each line of speech it pulled out, with who the record says spoke it. The feed draws these as that character's own rows. */
  speech?: Array<{ speakerId: string | null; speakerLabel: string; text: string }>;
  /** Encounter lines (encounter_begin/round/down/up/end, since 2026-10-08): which encounter, so the feed folds begin → end. */
  encounterId?: string;
  encounterName?: string;
}

export type TerminalPayload =
  | ChangeLogPayload
  | DiceRollPayload
  | ChatPayload
  | CommandPayload
  | AIMessagePayload
  | GameEventPayload;

// ── Unified Event ──────────────────────────────────────────────────────────

export interface TerminalEvent {
  id: string;
  type: TerminalEventType;
  timestamp: string;             // ISO 8601
  campaignId: string;

  actor: TerminalActor;
  actorUserId: string;
  actorName: string;

  characterId?: string;
  characterName?: string;

  sessionId?: string | null;     // null = between sessions

  payload: TerminalPayload;
}

// ── Session ────────────────────────────────────────────────────────────────

export interface GameSessionInfo {
  id: string;
  number: number;
  name: string | null;
  startedAt: string;
  endedAt: string | null;
}

// ── Query ──────────────────────────────────────────────────────────────────

export interface TerminalQueryParams {
  campaignId: string;
  types?: TerminalEventType[];
  sessionId?: string | null;     // null = between sessions, undefined = all
  after?: string;                // ISO timestamp for incremental fetch
  cursor?: string;
  limit?: number;
}

// ── Filter state (client-side) ─────────────────────────────────────────────

export type TerminalFilter = 'all' | 'chat' | 'dice' | 'changes' | 'ai' | 'events';
