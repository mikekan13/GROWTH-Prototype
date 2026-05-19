/**
 * Time Stack — deterministic initiative ordering for encounters.
 *
 * GROWTH canon (per design notes): action timing flows through the three
 * pillars in order — Mercy (Flow-led, acts first) → Balance → Severity
 * (Focus-led, acts last). This module turns a participant list into an
 * ordered queue using a deterministic, reproducible algorithm. The same
 * inputs always produce the same ordering — useful for replay, logs, and
 * deterministic AI behavior.
 *
 * Pillar tier assignment per participant: whichever of Flow / Focus is
 * higher chooses the tier. Flow dominant → Mercy. Focus dominant → Severity.
 * Tied or both zero → Balance.
 *
 * Within a tier, participants order by combined Flow+Focus (the
 * "presence" score). Final tie-break: alphabetical id, so the order is
 * fully deterministic across replays.
 *
 * v1 algorithm — Mike can replace this with a different ordering rule
 * later. Decision was that "something deterministic is better than nothing
 * deterministic" for unblocking the combat loop.
 */

import type { EncounterParticipant, TimeStackEntry } from '@/types/encounter';

const TIER_RANK: Record<TimeStackEntry['pillarTier'], number> = {
  mercy: 0,
  balance: 1,
  severity: 2,
};

export function classifyPillarTier(flow: number, focus: number): TimeStackEntry['pillarTier'] {
  if (flow > focus) return 'mercy';
  if (focus > flow) return 'severity';
  return 'balance';
}

export function presenceScore(flow: number, focus: number): number {
  return flow + focus;
}

/**
 * Build the ordered Time Stack from a list of participants. Participants
 * with no Flow/Focus values default to 0 (Balance tier, score 0).
 */
export function buildTimeStack(participants: ReadonlyArray<EncounterParticipant>): TimeStackEntry[] {
  const entries: TimeStackEntry[] = participants.map((p) => {
    const flow = p.flowPriority ?? 0;
    const focus = p.focusPriority ?? 0;
    return {
      participantId: p.id,
      score: presenceScore(flow, focus),
      pillarTier: classifyPillarTier(flow, focus),
    };
  });

  entries.sort((a, b) => {
    // 1. Tier (Mercy first, Severity last)
    const tierDiff = TIER_RANK[a.pillarTier] - TIER_RANK[b.pillarTier];
    if (tierDiff !== 0) return tierDiff;
    // 2. Higher presence acts first
    if (a.score !== b.score) return b.score - a.score;
    // 3. Deterministic tie-break by id
    return a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0;
  });

  return entries;
}

/**
 * Given a Time Stack and the current participantId, return the participantId
 * of whoever acts next (wraps to the top of the next round).
 */
export function nextParticipantId(
  stack: ReadonlyArray<TimeStackEntry>,
  currentParticipantId: string | undefined,
): string | undefined {
  if (stack.length === 0) return undefined;
  if (!currentParticipantId) return stack[0].participantId;
  const idx = stack.findIndex((e) => e.participantId === currentParticipantId);
  if (idx === -1) return stack[0].participantId;
  return stack[(idx + 1) % stack.length].participantId;
}
