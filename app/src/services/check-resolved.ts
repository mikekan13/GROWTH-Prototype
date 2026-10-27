/**
 * After a pending skill check resolves (wager or 90 s auto-resolve), resolve
 * whatever it was started FOR (perception unit 11: an inspection raises the
 * inspector's familiarity). Best-effort: never throws, never changes the
 * check's own result.
 */
import 'server-only';
import type { PendingCheck } from '@/lib/pending-checks';

export interface CheckOutcome {
  total: number;
  success: boolean;
  margin: number;
  /** Effort wagered per governor (lower-case names), e.g. { wit: 2 }. */
  effortBy: Record<string, number>;
  /** The Fate Die and trait flat, when the resolver has them (the roll card writes them). */
  fdResult?: number;
  traitFlat?: number;
  /** Who chose the Effort, when not the check's owner by hand ('ai' | 'ai-timeout'). */
  chosenBy?: 'ai' | 'ai-timeout';
}

export async function afterCheckResolved(pending: Pick<PendingCheck, 'campaignId' | 'purpose' | 'isSkilled'> & Partial<Pick<PendingCheck, 'skillName' | 'attributeName' | 'sdDie' | 'sdResult' | 'fateDie' | 'dr' | 'difficultyHint' | 'skillLevel'>> & { id?: string }, outcome: CheckOutcome): Promise<void> {
  if (!pending.purpose) return;
  try {
    if (pending.purpose.kind === 'roll') {
      const { writeRollCard } = await import('@/services/table-roll');
      await writeRollCard(pending.campaignId, pending as Parameters<typeof writeRollCard>[1], outcome);
      return;
    }
    if (pending.purpose.kind === 'inspect') {
      const { resolveInspection } = await import('@/services/inspection');
      await resolveInspection(pending.campaignId, pending.purpose, { ...outcome, skilled: pending.isSkilled, checkId: pending.id });
    }
  } catch (err) {
    console.warn('[check-resolved] purpose failed', err);
  }
}
