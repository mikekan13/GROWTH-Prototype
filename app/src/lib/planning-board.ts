/**
 * Planning board — the MINIMUM of TABLE-RHYTHM-DESIGN §3 that active
 * inspection needs (perception unit 11, 2026-10-09). U3's full board (an
 * intent chip for every entity, chips UI, edit-or-ride) is NOT built; this
 * holds only declared INSPECT intents.
 *
 * "Commit = the GM's next move (calling a check or starting to narrate
 * results). No timer, no confirm button." → takeIntents() is called from
 * those two moves (services/inspection.commitPlanningBoardOnGmMove).
 *
 * Server-side, in memory, globalThis (survives HMR) — the same shape as
 * lib/pending-checks. A restart drops unposted chips (they are seconds old).
 */
import 'server-only';

export interface InspectIntentChip {
  id: string;
  campaignId: string;
  kind: 'inspect';
  /** The inspecting character. */
  characterId: string;
  subjectId: string;
  subjectKind: 'ITEM' | 'CHARACTER' | 'NPC' | 'LOCATION';
  subjectName: string;
  /** The skill to use; null = not named yet (the system picks at commit unless the GM names one). */
  skillName: string | null;
  /** Who named the skill. */
  skillBy: 'player' | 'gm' | null;
  /** DR the GM set; null = INSPECT_TUNING.defaultDr. */
  dr: number | null;
  /** The words that declared it. */
  text: string;
  postedBy: string;
  createdAt: number;
}

export type IntentChip = InspectIntentChip;

const g = globalThis as typeof globalThis & { __planningBoard?: Map<string, IntentChip> };
const board = (g.__planningBoard ??= new Map());

/** Post a chip. One open inspect chip per character + subject: a re-declaration replaces it. */
export function postIntent(chip: IntentChip): IntentChip {
  for (const [id, c] of board) {
    if (c.campaignId === chip.campaignId && c.characterId === chip.characterId && c.subjectId === chip.subjectId) board.delete(id);
  }
  board.set(chip.id, chip);
  return chip;
}

export function getIntent(id: string): IntentChip | undefined {
  return board.get(id);
}

export function listIntents(campaignId: string): IntentChip[] {
  return [...board.values()].filter((c) => c.campaignId === campaignId).sort((a, b) => a.createdAt - b.createdAt);
}

export function updateIntent(id: string, patch: Partial<Pick<IntentChip, 'skillName' | 'skillBy' | 'dr'>>): IntentChip | undefined {
  const c = board.get(id);
  if (!c) return undefined;
  const next = { ...c, ...patch };
  board.set(id, next);
  return next;
}

export function removeIntent(id: string): IntentChip | undefined {
  const c = board.get(id);
  board.delete(id);
  return c;
}

/** Commit: every open chip of the campaign leaves the board, in posting order. */
export function takeIntents(campaignId: string): IntentChip[] {
  const out = listIntents(campaignId);
  for (const c of out) board.delete(c.id);
  return out;
}

/** Tests only. */
export function clearBoard(): void {
  board.clear();
}
