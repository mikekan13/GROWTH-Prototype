/**
 * Slot builder (pure) — Layer 1 of the speed stack (Mike 09-03/04).
 *
 * "The entity with the most actions sets the granularity within the 6
 * seconds." The round is sliced into N = max(total actions) slots. The
 * faster entity's SURPLUS actions run solo first; the rest run in lockstep.
 * A slower entity's actions pack toward the END of the round (confirmed
 * intended): 3 vs 6 = B1 · B2 · B3 · (B4,A1) · (B5,A2) · (B6,A3).
 *
 * A participant's k actions therefore occupy slots [N−k, N−1].
 */
import type { Intention, Participant, Slot, SlotEntry } from './types';
import { totalActions } from './action-economy';

export interface SlotInput {
  participantId: string;
  totalActions: number;
  /** Intention ids in the order the participant declared them (length ≤ totalActions). */
  intentionIds: string[];
}

export function buildSlots(inputs: SlotInput[]): Slot[] {
  const n = inputs.reduce((m, p) => Math.max(m, p.totalActions), 0);
  const slots: Slot[] = Array.from({ length: n }, (_, index) => ({ index, entries: [] }));
  for (const p of inputs) {
    const k = Math.max(0, p.totalActions);
    const start = n - k;
    for (let a = 0; a < k; a++) {
      const entry: SlotEntry = {
        participantId: p.participantId,
        actionIndex: a,
        intentionId: p.intentionIds[a] ?? null,
      };
      slots[start + a].entries.push(entry);
    }
  }
  return slots;
}

/** Convenience: build slot inputs straight from participants + their declared intentions. */
export function slotInputsFor(participants: Participant[], intentions: Intention[]): SlotInput[] {
  return participants
    .filter(p => !p.downed)
    .map(p => ({
      participantId: p.id,
      totalActions: totalActions(p.pools),
      intentionIds: intentions.filter(i => i.participantId === p.id).map(i => i.id),
    }));
}

/** Number of a participant's actions that have NOT yet resolved as of slot `atSlot` (exclusive). */
export function actionsRemainingAt(slots: Slot[], participantId: string, atSlot: number): number {
  let n = 0;
  for (const s of slots) {
    if (s.index < atSlot) continue;
    n += s.entries.filter(e => e.participantId === participantId).length;
  }
  return n;
}
