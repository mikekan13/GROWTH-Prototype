/**
 * Campaign Stream Events — Real-time event types for SSE.
 *
 * These events flow over Server-Sent Events to all connected clients
 * in a campaign. Some are persisted (terminal events), some are transient
 * (skill check prompts, connection status, heartbeats).
 */

import type { TerminalEvent } from './terminal';

// ── Skill Check Flow ──────────────────────────────────────────────────────

/** GM initiates a skill check — sent to the target player */
export interface SkillCheckRequestEvent {
  kind: 'skill_check_request';
  checkId: string;
  targetCharacterId: string;
  targetCharacterName: string;
  skillName?: string;          // Omit for unskilled (raw attribute) checks
  skillLevel?: number;
  attributeName?: string;      // Governor attribute for unskilled checks
  dr: number;
  difficultyHint: 'blue' | 'purple' | 'red';
  requestedBy: string;         // GM username
}

/** System prompts player to wager effort after SD roll */
export interface EffortWagerPromptEvent {
  kind: 'effort_wager_prompt';
  checkId: string;
  sdResult: number;            // What the skill die rolled — player sees this
  sdDie: string;               // e.g. "d6" or "flat:2"
  difficultyHint: 'blue' | 'purple' | 'red';
  availableGovernors: Array<{
    name: string;
    current: number;
    pillar: 'body' | 'spirit' | 'soul';
  }>;
  maxPossible: number;         // FD Max + Skill Level — hard ceiling
  skillLevel: number;          // For display
  skillName?: string;          // For display
  fateDie: string;             // e.g. "d6" — the die they'll throw
  fdMax: number;               // Max FD result (for range calc)
}

/** Player submits their effort wager */
export interface EffortWagerSubmitEvent {
  kind: 'effort_wager_submit';
  checkId: string;
  characterId: string;
  wagers: Array<{
    governor: string;
    amount: number;
  }>;
}

/** Final check result — broadcast to everyone */
export interface CheckResultEvent {
  kind: 'check_result';
  checkId: string;
  characterId: string;
  characterName: string;
  skillName?: string;
  sdDie: string;
  sdResult: number;
  fdDie: string;
  fdResult: number;
  effort: number;
  /** Sum of Nectar/Blossom/Thorn rollModifiers that fired for this check. */
  traitFlat?: number;
  /** Per-trait breakdown for UI ("+2 from Sword's Edge"). */
  traitSources?: Array<{ traitName: string; traitType: 'nectar' | 'blossom' | 'thorn'; flat: number; label?: string }>;
  total: number;
  dr: number;
  success: boolean;
  margin: number;
}

// ── Connection Lifecycle ──────────────────────────────────────────────────

export interface ConnectionEvent {
  kind: 'connection';
  userId: string;
  username: string;
  role: string;
  status: 'connected' | 'disconnected';
}

export interface StateSyncEvent {
  kind: 'state_sync';
  connectedUsers: Array<{ userId: string; username: string; role: string }>;
}

// ── State Changes ─────────────────────────────────────────────────────────

/** Character data changed — triggers UI refresh */
export interface CharacterUpdateEvent {
  kind: 'character_update';
  characterId: string;
  characterName: string;
  fields: string[];            // Which top-level fields changed
}

/** Portrait regenerated */
export interface PortraitUpdateEvent {
  kind: 'portrait_update';
  characterId: string;
  portraitUrl: string;
}

// ── Death Save (T27, r-2026-07-11-01) ─────────────────────────────────────

/**
 * Death-save lifecycle on the GM surface. TRIGGERED fires when a character
 * hits a death door (Frequency 0 / vital part destroyed); RESOLVED carries
 * the roll outcome; SPLIT_EXECUTED announces the ghost transformation.
 */
export interface DeathSaveEvent {
  kind: 'death_save';
  phase: 'TRIGGERED' | 'RESOLVED' | 'SPLIT_EXECUTED';
  characterId: string;
  characterName: string;
  door: 'COMBAT' | 'FATED_AGE';
  /** TRIGGERED: what tripped the door (e.g. 'frequency_zero', 'vital_destroyed:Heart'). */
  trigger?: string;
  /** RESOLVED fields. Tara's choice: 1|2|3 static, 'd4'…'d20', or 'NO_REAP'. */
  taraChoice?: string;
  fateRoll?: number;
  /** Trait-modifier total applied to the fate roll + source labels
   *  (exploits must be easy to track — show "+2 from Grave-Warded"). */
  modifierTotal?: number;
  modifierSources?: string[];
  characterTotal?: number;
  taraResult?: number;
  survived?: boolean;
}

// ── Terminal Event Relay ──────────────────────────────────────────────────

/** A persisted terminal event relayed in real-time */
export interface TerminalEventRelay {
  kind: 'terminal_event';
  event: TerminalEvent;
}

// ── Heartbeat ─────────────────────────────────────────────────────────────

export interface HeartbeatEvent {
  kind: 'heartbeat';
}

// ── Union ─────────────────────────────────────────────────────────────────

export type StreamEventData =
  | SkillCheckRequestEvent
  | EffortWagerPromptEvent
  | EffortWagerSubmitEvent
  | CheckResultEvent
  | ConnectionEvent
  | StateSyncEvent
  | CharacterUpdateEvent
  | PortraitUpdateEvent
  | DeathSaveEvent
  | TerminalEventRelay
  | HeartbeatEvent;

/** The envelope sent over SSE */
export interface CampaignStreamEvent {
  id: string;
  timestamp: string;
  campaignId: string;
  /** Restrict delivery to a single user. Omit to broadcast to all. */
  targetUserId?: string;
  data: StreamEventData;
}
