/**
 * Genesis completion stages — the pure half. After the sheet, before Born.
 *
 * Mike's order (2026-10-16): "1. Seed 2. Root 3. Branches 4. Appearance
 * 5. Possessions and Item/building their physical world 6. Memories from all
 * that building 7. Vines decided 8. Portrait generated 9. Done" — and "age
 * comes from the root + branches" (a SUM, not a stage). "How can anyone
 * decide their current goals unless everything else is built."
 *
 *   sheet (seed/root/branches; age stamped from the blocks as it closes)
 *   → AGE         repair only — runs when the sum still misses the brief
 *   → APPEARANCE  PLAYER GATE: the designer's face approved + body rendered
 *   → WORLD       her physical world: possessions, items, home + rooms, the
 *                 people she names, the facts about it (was POSSESSIONS +
 *                 SEEDS + WORLD_FACTS)
 *   → MEMORIES    one for every thing built (items, marks, places, people)
 *   → VINES       goals, from a whole person in a whole life
 *   → PORTRAIT    GATE: the portrait painted from all of it (enforced once
 *                 the portrait step exists — GENESIS_PORTRAIT_GATE=on)
 *   → Born
 *
 * DB-side detection and the stage walk live in services/genesis-stages.ts.
 */

export const GENESIS_POST_SHEET_STAGES = ['AGE', 'APPEARANCE', 'WORLD', 'MEMORIES', 'VINES', 'PORTRAIT'] as const;
export type GenesisPostSheetStage = (typeof GENESIS_POST_SHEET_STAGES)[number];

/** Stages a person settles at the designer, not JEWL: the session waits. */
export const GATE_STAGES = ['APPEARANCE', 'PORTRAIT'] as const;
export type GenesisGateStage = (typeof GATE_STAGES)[number];

/** Pre-2026-10-16 stage names still on in-flight sessions → their new home. */
const LEGACY_STAGE: Record<string, GenesisPostSheetStage> = {
  POSSESSIONS: 'WORLD', SEEDS: 'WORLD', WORLD_FACTS: 'WORLD',
};

/** A legacy stage name mapped forward; anything else unchanged. */
export function normalizeStage(stage: string | null | undefined): string | null | undefined {
  return stage && LEGACY_STAGE[stage] ? LEGACY_STAGE[stage] : stage;
}

export function isPostSheetStage(stage: string | null | undefined): stage is GenesisPostSheetStage {
  const s = normalizeStage(stage);
  return !!s && (GENESIS_POST_SHEET_STAGES as readonly string[]).includes(s);
}

export function isGateStage(stage: string | null | undefined): stage is GenesisGateStage {
  return !!stage && (GATE_STAGES as readonly string[]).includes(stage);
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
  opts: { /** Walk the PORTRAIT gate when evidence is unknown (off until the step exists). */ portraitGate?: boolean } = {},
): GenesisPostSheetStage | null {
  const order = GENESIS_POST_SHEET_STAGES;
  const cur = normalizeStage(current);
  const from = cur === 'BUILDING' ? 0 : isPostSheetStage(cur) ? order.indexOf(cur) + 1 : order.length;
  for (let i = from; i < order.length; i++) {
    if (!missing) {
      if (order[i] === 'PORTRAIT' && !opts.portraitGate) continue;
      return order[i];
    }
    if (missing.has(order[i])) return order[i];
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
  /** GRO.vine slots her seed grants. When known, VINES is missing until every slot holds a vine. */
  vineSlots?: number;
  /** The designer's face approved and the body rendered. */
  lookOk?: boolean;
  /** Character.portrait set. */
  portraitOk?: boolean;
  /** Enforce the PORTRAIT gate (off until the portrait step exists). */
  portraitGate?: boolean;
}

/**
 * Which completion stages a character still lacks. A stamped stage is done;
 * otherwise evidence decides. WORLD is also satisfied by the three legacy
 * stamps it replaced. MEMORIES has no cheap per-character evidence, so only
 * its stamp counts.
 */
export function missingStages(e: StageEvidence): Set<GenesisPostSheetStage> {
  const missing = new Set<GenesisPostSheetStage>();
  const done = (s: string) => !!e.stamps[s];
  if (!done('AGE') && !e.ageOk) missing.add('AGE');
  if (!done('APPEARANCE') && !e.lookOk) missing.add('APPEARANCE');
  const legacyWorld = done('POSSESSIONS') && done('SEEDS') && done('WORLD_FACTS');
  const worldEvidence = e.heldItems + e.ownsEdges > 0 && e.npcSeeds + e.placeEdges > 0;
  if (!done('WORLD') && !legacyWorld && !worldEvidence) missing.add('WORLD');
  if (!done('MEMORIES')) missing.add('MEMORIES');
  // Every slot her seed gives holds a vine (Mike 2026-10-17: "Violet is a
  // human so she should have 4 gro.vines active") — the stamp does not
  // excuse an empty slot.
  if (e.vineSlots !== undefined ? e.vines < e.vineSlots : (!done('VINES') && e.vines === 0)) missing.add('VINES');
  if (e.portraitGate && !done('PORTRAIT') && !e.portraitOk) missing.add('PORTRAIT');
  return missing;
}

/** Fixed prefix of a session's blocked reason while a gate waits on a person. */
export const GATE_BLOCKED_REASON = 'waiting at the designer —';

export function gateBlockedReason(stage: GenesisGateStage): string {
  return stage === 'APPEARANCE'
    ? `${GATE_BLOCKED_REASON} approve the face and body in the Tapestry (Appearance) to go on`
    : `${GATE_BLOCKED_REASON} approve the portrait in the Tapestry to go on`;
}

export function isGateBlocked(reason: string | null | undefined): boolean {
  return !!reason && reason.startsWith(GATE_BLOCKED_REASON);
}

/** Relationship types a location seed links its character with. */
export const PLACE_RELATIONS = ['home', 'hometown', 'workplace', 'frequents', 'origin'] as const;

/** A GM-typed chat message offered to JEWL as world source material. */
export interface GmWorldMessage {
  id: string;
  at: string;
  text: string;
}
