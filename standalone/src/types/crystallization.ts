/**
 * Crystallization System — Types for fluid → crystallized entity transitions
 *
 * Entities below the purple line on the Relations Canvas are FLUID (draft/planning).
 * When dragged above the line and confirmed, they CRYSTALLIZE — their KV commits
 * to the campaign's karmic ledger.
 */

export type EntityType = 'character' | 'location' | 'item';
export type EntityState = 'fluid' | 'crystallized';

export interface CrystallizationEvent {
  entityId: string;
  entityType: EntityType;
  entityName: string;
  karmicValue: number;
  action: 'crystallize' | 'dissolve';  // dissolve = reverse crystallization
  campaignPoolBefore: number;
  campaignPoolAfter: number;
  timestamp: string;
}

export interface EntityKVInfo {
  entityId: string;
  entityType: EntityType;
  entityName: string;
  karmicValue: number;
  state: EntityState;
  kvBreakdown?: Record<string, number>;  // Optional detail (e.g. { attributes: 9, skills: 5 })
}

/** Ledger entry stored per campaign */
export interface CrystallizationLedgerEntry {
  id: string;
  entityId: string;
  entityType: EntityType;
  entityName: string;
  kvCommitted: number;
  action: 'crystallize' | 'dissolve';
  poolBefore: number;
  poolAfter: number;
  actorId: string;
  timestamp: string;
}
