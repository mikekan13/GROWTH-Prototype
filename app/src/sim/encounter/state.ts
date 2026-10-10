/**
 * Encounter state — what lives in Encounter.state (JSON) for the walking
 * version, plus the snapshot builder that turns a character row into a
 * round-engine Participant.
 */
import type { GrowthCharacter } from '@/types/growth';
import type { Intention, Participant, RoundResult } from '../round/types';
import { actionPools, attributeSnapshot, speedGauges, toParticipantSkills } from '../round/action-economy';

export interface EncounterState {
  participants: Participant[];
  /** Intentions declared for the NEXT round (cleared when the round runs). */
  intentions: Intention[];
  /** GM's scene setup narration (Stage 1). */
  sceneNarration: string | null;
  /** Completed rounds, oldest first. */
  rounds: RoundResult[];
  /** Per-participant note on how the last round's intentions were produced. */
  lastPlan: Record<string, { source: 'model' | 'heuristic' | 'player' | 'gm'; note?: string }>;
}

export function emptyState(sceneNarration: string | null = null): EncounterState {
  return { participants: [], intentions: [], sceneNarration, rounds: [], lastPlan: {} };
}

export function parseState(raw: string): EncounterState {
  try {
    const s = JSON.parse(raw) as Partial<EncounterState>;
    return {
      participants: (s.participants ?? []).map(p => {
        // Back-fill fields added after the first encounters were stored.
        const legacy = p as Partial<Participant> & Pick<Participant, 'id' | 'name'>;
        return {
          ...p,
          heldBaseResist: legacy.heldBaseResist ?? p.heldResist ?? 0,
          heldCondition: legacy.heldCondition ?? (p.heldItemName ? 3 : 0),
          heldItemId: legacy.heldItemId ?? null,
          attrs: legacy.attrs ?? attributeSnapshot(undefined),
        };
      }),
      intentions: s.intentions ?? [],
      sceneNarration: s.sceneNarration ?? null,
      rounds: s.rounds ?? [],
      lastPlan: s.lastPlan ?? {},
    };
  } catch {
    return emptyState();
  }
}

export interface HeldItem {
  id: string;
  name: string;
  baseResist: number;
  /** 0–4 */
  condition: number;
}

export interface SnapshotInput {
  id: string;
  name: string;
  entityType: string;
  sheet: GrowthCharacter | null;
  side: string;
  /** First held item that can interpose (v0: any held item with baseResist > 0). */
  held?: HeldItem | null;
}

/** Item condition tiers (canon): 1 Broken = half resist; 0 Destroyed = none. */
export function effectiveHeldResist(baseResist: number, condition: number): number {
  if (condition <= 0) return 0;
  if (condition === 1) return Math.floor(baseResist / 2);
  return baseResist;
}

/** Build a Participant from a character. PCs are player-controlled; everything else runs on its branch. */
export function participantFromCharacter(input: SnapshotInput): Participant {
  const sheet = input.sheet ?? undefined;
  const held = input.held ?? null;
  return {
    id: input.id,
    name: input.name,
    side: input.side,
    control: input.entityType === 'PLAYER_CHARACTER' ? 'player' : 'branch',
    pools: actionPools(sheet, 0),
    actionMod: 0,
    gauges: speedGauges(sheet),
    skills: toParticipantSkills(sheet?.skills),
    fateDie: (sheet?.creation?.seed?.baseFateDie as Participant['fateDie']) ?? 'd8',
    attrs: attributeSnapshot(sheet),
    heldResist: held ? effectiveHeldResist(held.baseResist, held.condition) : 0,
    heldBaseResist: held?.baseResist ?? 0,
    heldCondition: held?.condition ?? 0,
    heldItemId: held?.id ?? null,
    heldItemName: held?.name ?? null,
    downed: false,
  };
}

/** Refresh the mutable parts of a participant (attribute currents, gauges) from a fresh sheet. */
export function refreshParticipant(p: Participant, sheet: GrowthCharacter | null): Participant {
  if (!sheet) return p;
  return { ...p, attrs: attributeSnapshot(sheet), gauges: speedGauges(sheet) };
}
