/**
 * Genesis completion stages — the pure half (2026-10-12). After the sheet,
 * before Born: AGE → POSSESSIONS → SEEDS → WORLD_FACTS → VINES.
 * DB-side detection and the stage walk live in services/genesis-stages.ts.
 */

export const GENESIS_POST_SHEET_STAGES = ['AGE', 'POSSESSIONS', 'SEEDS', 'WORLD_FACTS', 'VINES'] as const;
export type GenesisPostSheetStage = (typeof GENESIS_POST_SHEET_STAGES)[number];

export function isPostSheetStage(stage: string | null | undefined): stage is GenesisPostSheetStage {
  return !!stage && (GENESIS_POST_SHEET_STAGES as readonly string[]).includes(stage);
}

/** The build-phase stages whose "done" walks forward instead of closing. */
export function isBuildPhaseStage(stage: string | null | undefined): boolean {
  return stage === 'BUILDING' || isPostSheetStage(stage);
}

/**
 * The stage after `current` that still needs doing. Pure. `missing` null =
 * unknown (detection failed) → every later stage counts as missing. Returns
 * null when nothing is left (→ Born).
 */
export function nextGenesisStage(
  current: string | null | undefined,
  missing: ReadonlySet<string> | null,
): GenesisPostSheetStage | null {
  const order = GENESIS_POST_SHEET_STAGES;
  const from = current === 'BUILDING' ? 0 : isPostSheetStage(current) ? order.indexOf(current) + 1 : order.length;
  for (let i = from; i < order.length; i++) {
    if (!missing || missing.has(order[i])) return order[i];
  }
  return null;
}

/** A block instance as the age math reads it. */
export interface AgeLink {
  type: string;
  /** The instance's own years (CharacterBlockLink.ageAdded), if set. */
  instanceYears: number | null;
  /** The archetype's ageAdded (ForgeItem data). */
  archetypeYears: number | null;
}

/** Starting age = Σ years over roots + branches (instance years win; seeds add 0). */
export function startingAgeFromLinks(links: AgeLink[]): number {
  return links
    .filter(l => l.type === 'root' || l.type === 'branch')
    .reduce((sum, l) => sum + Math.max(0, l.instanceYears ?? l.archetypeYears ?? 0), 0);
}

/** `AGE: 25` from a genesis brief. */
export function briefAge(plan: string | null | undefined): number | null {
  const m = /^AGE:\s*(\d+)/m.exec(plan ?? '');
  return m ? Number(m[1]) : null;
}

/** The stage stamps genesis leaves on a sheet (`_genesisStages`). */
export function stagesDone(sheet: unknown): Record<string, string> {
  const s = (sheet as { _genesisStages?: unknown } | null)?._genesisStages;
  return s && typeof s === 'object' ? s as Record<string, string> : {};
}

/** Evidence the completion stages read for one character. */
export interface StageEvidence {
  stamps: Record<string, string>;
  ageOk: boolean;
  heldItems: number;
  ownsEdges: number;
  npcSeeds: number;
  placeEdges: number;
  vines: number;
}

/** Which completion stages a character still lacks. A stamped stage is done;
 *  otherwise evidence decides. WORLD_FACTS has no per-character evidence
 *  (facts are keyed by subject), so only its stamp counts. */
export function missingStages(e: StageEvidence): Set<GenesisPostSheetStage> {
  const missing = new Set<GenesisPostSheetStage>();
  const done = (s: GenesisPostSheetStage) => !!e.stamps[s];
  if (!done('AGE') && !e.ageOk) missing.add('AGE');
  if (!done('POSSESSIONS') && e.heldItems + e.ownsEdges === 0) missing.add('POSSESSIONS');
  if (!done('SEEDS') && e.npcSeeds + e.placeEdges === 0) missing.add('SEEDS');
  if (!done('WORLD_FACTS')) missing.add('WORLD_FACTS');
  if (!done('VINES') && e.vines === 0) missing.add('VINES');
  return missing;
}

/** Relationship types a location seed links its character with. */
export const PLACE_RELATIONS = ['home', 'hometown', 'workplace', 'frequents', 'origin'] as const;

/** A GM-typed chat message offered to JEWL as world source material. */
export interface GmWorldMessage {
  id: string;
  at: string;
  text: string;
}
