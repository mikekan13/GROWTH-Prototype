/**
 * Encounter state — what lives in Encounter.state (JSON) for the walking
 * version, plus the snapshot builder that turns a character row into a
 * round-engine Participant.
 */
import type { GrowthCharacter } from '@/types/growth';
import type { Intention, Participant, RoundResult } from '../round/types';
import { actionPools, speedGauges, toParticipantSkills } from '../round/action-economy';

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
      participants: s.participants ?? [],
      intentions: s.intentions ?? [],
      sceneNarration: s.sceneNarration ?? null,
      rounds: s.rounds ?? [],
      lastPlan: s.lastPlan ?? {},
    };
  } catch {
    return emptyState();
  }
}

export interface SnapshotInput {
  id: string;
  name: string;
  entityType: string;
  sheet: GrowthCharacter | null;
  side: string;
  /** First held item that can interpose (v0: any held item with baseResist > 0). */
  held?: { name: string; baseResist: number } | null;
}

/** Build a Participant from a character. PCs are player-controlled; everything else runs on its branch. */
export function participantFromCharacter(input: SnapshotInput): Participant {
  const sheet = input.sheet ?? undefined;
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
    heldResist: input.held?.baseResist ?? 0,
    heldItemName: input.held?.name ?? null,
    downed: false,
  };
}
