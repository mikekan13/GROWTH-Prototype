/**
 * Global Change Log — Type Definitions
 *
 * Every state modification in an active campaign produces structured log entries.
 * Designed for GM oversight and future AI co-pilot read access.
 */

export type ChangeActor = 'player' | 'gm' | 'ai_copilot' | 'system';

export type ChangeCategory =
  | 'attribute'
  | 'condition'
  | 'inventory'
  | 'equipment'
  | 'skill'
  | 'magic'
  | 'trait'
  | 'grovine'
  | 'vitals'
  | 'identity'
  | 'levels'
  | 'fear'
  | 'harvest'
  | 'backstory'
  | 'campaign'
  | 'status';

export interface FieldChange {
  path: string;           // JSON dot-path: "attributes.clout.current"
  previousValue: unknown;
  newValue: unknown;
}

export interface ChangeLogEntry {
  id: string;
  campaignId: string;
  characterId: string;
  characterName: string;
  groupId: string | null;

  actor: ChangeActor;
  actorUserId: string;

  category: ChangeCategory;
  description: string;

  changes: FieldChange[];

  source: string | null;

  revertible: boolean;
  revertedAt: string | null;
  revertedBy: string | null;

  snapshotBefore: string | null;

  createdAt: string;
}

export interface ChangeLogGroup {
  groupId: string;
  entries: ChangeLogEntry[];
  summary: string;
  timestamp: string;
}

export interface ChangeLogQueryParams {
  campaignId: string;
  characterId?: string;
  category?: ChangeCategory[];
  actor?: ChangeActor[];
  after?: string;
  before?: string;
  cursor?: string;
  limit?: number;
}
