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
  // [PLACEHOLDER] Time Stack ordering — needs full combat resolution integration
  // [PLACEHOLDER] Environmental effects — terrain, weather, lighting modifiers
}

export interface EncounterParticipant {
  id: string;                   // Character ID or generated NPC ID
  name: string;
  type: 'pc' | 'npc' | 'creature' | 'environmental';
  side: 'ally' | 'enemy' | 'neutral';

  // Action economy (per-pillar pools)
  actions?: {
    body: number;               // (Clout+Celerity+Constitution)/25, min 1
    spirit: number;             // (Flow+Frequency+Focus)/25, min 1
    soul: number;               // (Willpower+Wisdom+Wit)/25, min 1
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
  defensive: '#3E78C0',         // Blue
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
