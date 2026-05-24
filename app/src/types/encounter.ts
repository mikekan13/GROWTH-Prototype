/**
 * GRO.WTH Encounter System — TypeScript Interfaces
 * Encounters track combat, social, and exploration scenes.
 * The three-phase combat system: Intention → Resolution → Impact
 */

export type EncounterType = 'combat' | 'social' | 'exploration' | 'puzzle' | 'event';
export type EncounterPhase = 'intention' | 'resolution' | 'impact';
export type EncounterStatus = 'PLANNED' | 'ACTIVE' | 'PAUSED' | 'RESOLVED';

export interface GrowthEncounter {
  description: string;
  participants: EncounterParticipant[];
  notes?: string;               // GM notes
  objectives?: string[];        // What players need to accomplish
  rewards?: string[];           // Potential rewards
  /** Time Stack — deterministic initiative order. See lib/time-stack.ts. */
  timeStack?: TimeStackEntry[];
  /** Environmental effects — terrain, weather, lighting modifiers. */
  environment?: EnvironmentalEffect[];
}

export interface TimeStackEntry {
  participantId: string;
  /** Combined initiative score used for ordering. */
  score: number;
  /** Pillar tier — Mercy (Flow-led), Balance, or Severity (Focus-led). */
  pillarTier: 'mercy' | 'balance' | 'severity';
}

export type EnvironmentalEffectKind =
  | 'terrain'        // difficult ground, slick, cramped, etc.
  | 'weather'        // rain, snow, fog
  | 'lighting'       // dim, dark, blinding
  | 'hazard'         // fire, poison cloud, falling debris
  | 'aura';          // magical / pillar-resonant zones

export interface EnvironmentalEffect {
  id: string;
  kind: EnvironmentalEffectKind;
  name: string;
  description?: string;
  /** Flat modifier applied to all participants' checks while active. */
  flatModifier?: number;
  /** Restricts the modifier to a specific pillar or skill. */
  appliesTo?: 'all' | 'body' | 'spirit' | 'soul' | string;
}

export interface EncounterParticipant {
  id: string;                   // Character ID or generated NPC ID
  name: string;
  type: 'pc' | 'npc' | 'creature' | 'environmental';
  side: 'ally' | 'enemy' | 'neutral';

  // Action economy (per-pillar pools). Per Mike 2026-05-20:
  //   actions = floor(sum of pillar attribute LEVELS / 25), min 1.
  //   Levels — not current pool, not augments.
  //   Frequency is intentionally EXCLUDED from Spirit (it is the life/death
  //   pool, not an action source).
  actions?: {
    body: number;               // (Clout + Celerity + Constitution) / 25, min 1
    spirit: number;             // (Flow + Focus) / 25, min 1   ← Frequency NOT included
    soul: number;               // (Willpower + Wisdom + Wit) / 25, min 1
    used: {
      body: number;
      spirit: number;
      soul: number;
    };
  };

  // Turn state
  intention?: string;           // Declared action (Phase 1)
  resolved?: boolean;           // Has this participant been resolved this round?
  conditions?: string[];        // Active conditions affecting this participant

  // Initiative modifiers
  flowPriority?: number;        // Flow attribute for Mercy priority
  focusPriority?: number;       // Focus attribute for Severity priority
}

// Action types from the rules
export type ActionType = 'offensive' | 'support' | 'defensive' | 'free' | 'joint' | 'reactive';

export const ACTION_TYPE_COLORS: Record<ActionType, string> = {
  offensive: '#E8585A',         // Red
  support: '#808080',           // Grey
  defensive: '#002f6c',         // Blue
  free: '#4ade80',              // Green
  joint: '#ffcc78',             // Gold
  reactive: '#c4a0e8',         // Purple
};

export const ENCOUNTER_TYPE_ICONS: Record<EncounterType, string> = {
  combat: '\u2694\uFE0F',       // crossed swords
  social: '\u{1F5E3}\uFE0F',   // speaking head
  exploration: '\u{1F9ED}',     // compass
  puzzle: '\u{1F9E9}',          // puzzle piece
  event: '\u{26A1}',            // lightning
};
