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
}

export async function afterCheckResolved(pending: Pick<PendingCheck, 'campaignId' | 'purpose' | 'isSkilled'>, outcome: CheckOutcome): Promise<void> {
  if (!pending.purpose) return;
  try {
    if (pending.purpose.kind === 'inspect') {
      const { resolveInspection } = await import('@/services/inspection');
      await resolveInspection(pending.campaignId, pending.purpose, { ...outcome, skilled: pending.isSkilled });
    }
  } catch (err) {
    console.warn('[check-resolved] purpose failed', err);
  }
}
