/**
 * Vines as custodian memory (Mike 2026-09-22, MEMORY-DESIGN §2).
 *
 * "The vine is the custodian's memory of the goal." When a canon event
 * touches a goal, the goal's custodian Godhead records it on the vine from
 * its side. The resistance is a different entity with its own vine and an
 * opposing custodian, who records the same event from the other side. One
 * truth, many angles — the God perspective upon the world.
 *
 * v0 coloring = the custodian's pillar stamped on the reading; the reading
 * itself is the canon narration as it bears on the goal. A model can phrase
 * it in the custodian's voice later; the structure is what matters now.
 */
import 'server-only';
import { prisma } from '@/lib/db';

export interface VineWriteInput {
  campaignId: string;
  canonEventId: string;
  cycle: number;
  narration: string;
  /** Goals this canon event touched (from the truth-side chain). */
  goalIds: string[];
}

export interface VineWriteResult {
  entries: Array<{ id: string; goalId: string; side: string; custodianId: string | null }>;
}

/** Record the event on every touched vine (custodian side) and on the resistance's vines (opposing side). */
export async function recordVineEntries(input: VineWriteInput): Promise<VineWriteResult> {
  const entries: VineWriteResult['entries'] = [];
  if (input.goalIds.length === 0) return { entries };

  const goals = await prisma.goal.findMany({
    where: { id: { in: input.goalIds } },
    select: { id: true, description: true, custodianId: true, pillar: true, characterId: true },
  });
  const custodians = new Map<string, { id: string; pillar: string }>();
  for (const g of goals) {
    if (g.custodianId && !custodians.has(g.custodianId)) {
      const gh = await prisma.godHead.findUnique({ where: { id: g.custodianId }, select: { id: true, pillar: true } });
      if (gh) custodians.set(gh.id, gh);
    }
  }

  for (const g of goals) {
    const custodian = g.custodianId ? custodians.get(g.custodianId) ?? null : null;
    const row = await prisma.vineEntry.create({
      data: {
        goalId: g.id,
        campaignId: input.campaignId,
        custodianId: custodian?.id ?? null,
        custodianPillar: custodian?.pillar ?? g.pillar ?? null,
        side: 'custodian',
        canonEventId: input.canonEventId,
        cycle: input.cycle,
        reading: `${input.narration} — as it bears on "${g.description}"`,
      },
    });
    entries.push({ id: row.id, goalId: g.id, side: 'custodian', custodianId: custodian?.id ?? null });

    // The resistance: entities that resist this goal, each with its own vines
    // and custodians, record the same event from the opposing side.
    const resisters = await prisma.entityRelationship.findMany({
      where: { sourceId: g.id, relationshipType: 'resisted_by' },
      select: { targetId: true },
    });
    for (const r of resisters) {
      const opposing = await prisma.goal.findMany({
        where: { characterId: r.targetId, status: 'ACTIVE' },
        select: { id: true, description: true, custodianId: true, pillar: true },
      });
      for (const og of opposing) {
        let oc: { id: string; pillar: string } | null = null;
        if (og.custodianId) {
          oc = custodians.get(og.custodianId) ?? (await prisma.godHead.findUnique({ where: { id: og.custodianId }, select: { id: true, pillar: true } }));
          if (oc) custodians.set(oc.id, oc);
        }
        const orow = await prisma.vineEntry.create({
          data: {
            goalId: og.id,
            campaignId: input.campaignId,
            custodianId: oc?.id ?? null,
            custodianPillar: oc?.pillar ?? og.pillar ?? null,
            side: 'resistance',
            canonEventId: input.canonEventId,
            cycle: input.cycle,
            reading: `${input.narration} — against "${g.description}", as it bears on "${og.description}"`,
          },
        });
        entries.push({ id: orow.id, goalId: og.id, side: 'resistance', custodianId: oc?.id ?? null });
      }
    }
  }
  return { entries };
}

/** Fire-and-forget wrapper — the vine is record-keeping; never fails the act. */
export function recordVineEntriesSafe(input: VineWriteInput): void {
  recordVineEntries(input).catch(err => console.warn('[vine-memory] write failed', err));
}

/** A vine read from the custodian's side: every entry on the goal, oldest first. */
export async function readVine(goalId: string) {
  return prisma.vineEntry.findMany({ where: { goalId }, orderBy: [{ cycle: 'asc' }, { createdAt: 'asc' }] });
}

/** Everything a custodian Godhead has recorded, across the vines it holds in one campaign. */
export async function readCustodianLedger(custodianId: string, campaignId: string, limit = 200) {
  return prisma.vineEntry.findMany({ where: { custodianId, campaignId }, orderBy: [{ cycle: 'desc' }, { createdAt: 'desc' }], take: limit });
}
