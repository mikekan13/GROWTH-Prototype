/**
 * Per-object perspective history (ruling r-2026-06-09-07).
 *
 * History is packaged directly into the canvas: when something happens in
 * a Location it is logged IN that Location; every character (PC and NPC,
 * even offscreen) carries a running history of their own experience. One
 * in-fiction event therefore writes one entry PER INVOLVED OBJECT, from
 * that object's perspective, all sharing an eventGroupId. Entries are
 * timestamped in meta cycles (the campaign clock).
 *
 * This service is the single write path — location mutations, the clock,
 * the future JEWL session engine (r-2026-06-09-08), combat, and harvests
 * all log through here.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';

export type HistorySubjectType = 'location' | 'character' | 'item' | 'campaign';

export interface PerspectiveEntry {
  subjectType: HistorySubjectType;
  subjectId: string;
  type: string;         // created|edited|arrival|departure|item_added|item_removed|status_change|clock_advance|harvest|narrative_event|combat
  summary: string;      // one-liner from the subject's perspective
  details?: string;
  actorId?: string;
  visibility?: 'gm' | 'public';
}

/**
 * Write one event as N perspective entries. `timestampCycle` is the
 * campaign clock at the moment of the event — pass the campaign's
 * currentCycle (callers that already mutated the clock pass the new value).
 */
export async function writeHistory(
  campaignId: string,
  timestampCycle: number,
  perspectives: PerspectiveEntry[],
): Promise<{ eventGroupId: string; count: number }> {
  if (perspectives.length === 0) return { eventGroupId: '', count: 0 };
  const eventGroupId = randomUUID();
  await prisma.historyEntry.createMany({
    data: perspectives.map(p => ({
      campaignId,
      subjectType: p.subjectType,
      subjectId: p.subjectId,
      timestampCycle,
      type: p.type,
      summary: p.summary,
      details: p.details,
      actorId: p.actorId,
      visibility: p.visibility ?? 'gm',
      eventGroupId,
    })),
  });
  return { eventGroupId, count: perspectives.length };
}

/** Convenience: current campaign clock for callers that haven't loaded it. */
export async function currentCycleOf(campaignId: string): Promise<number> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } });
  return c?.currentCycle ?? 0;
}

export interface HistoryQuery {
  subjectType?: HistorySubjectType;
  subjectId?: string;
  /** Players only ever see 'public'; GM sees everything. */
  gmView: boolean;
  limit?: number;
  beforeCycle?: number;
}

export async function queryHistory(campaignId: string, q: HistoryQuery) {
  return prisma.historyEntry.findMany({
    where: {
      campaignId,
      ...(q.subjectType ? { subjectType: q.subjectType } : {}),
      ...(q.subjectId ? { subjectId: q.subjectId } : {}),
      ...(q.gmView ? {} : { visibility: 'public' }),
      ...(q.beforeCycle !== undefined ? { timestampCycle: { lt: q.beforeCycle } } : {}),
    },
    orderBy: [{ timestampCycle: 'desc' }, { realTime: 'desc' }],
    take: Math.min(q.limit ?? 50, 200),
  });
}
