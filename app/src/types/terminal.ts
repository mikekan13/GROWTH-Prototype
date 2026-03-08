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
}

export interface ChatPayload {
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

export interface GameEventPayload {
  kind: 'game_event';
  eventType: string;             // "session_start", "session_end", "combat_begin", etc.
  description: string;
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
