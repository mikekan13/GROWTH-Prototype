/**
 * The World Ledger — nothing physical exists only in prose (Ruling 19). Every
 * grounded fact about an object, position, or property in a campaign's world
 * lives here as a WorldFact row. Facts are append-and-supersede, never
 * mutated in place: an update writes a new row and points the old one at it
 * via supersededById, so `currentFacts` always returns exactly one live fact
 * per subjectKey without losing history.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';

export interface WorldFactRecord {
  id: string;
  campaignId: string;
  subjectKey: string;
  fact: string;
  establishedAtCycle: number;
  supersededById: string | null;
}

/**
 * Establish a new fact. Does not check for an existing live fact on the same
 * subjectKey — callers that mean to replace a live fact should use
 * supersede() so the old row is marked rather than left as a stale duplicate.
 */
export async function establishFact(
  campaignId: string,
  subjectKey: string,
  fact: string,
  cycle: number,
): Promise<WorldFactRecord> {
  return prisma.worldFact.create({
    data: { campaignId, subjectKey, fact, establishedAtCycle: cycle },
  });
}

/**
 * All LIVE facts for a campaign (excludes superseded rows). Pass subjectKey
 * to scope to one subject; omit to get every live fact in the campaign.
 */
export async function currentFacts(campaignId: string, subjectKey?: string): Promise<WorldFactRecord[]> {
  return prisma.worldFact.findMany({
    where: { campaignId, subjectKey, supersededById: null },
    orderBy: { establishedAtCycle: 'asc' },
  });
}

/**
 * Supersede an existing fact with a new one at the given cycle. Writes the
 * new fact, then points the old row's supersededById at it. Returns the new
 * (now-live) fact.
 */
export async function supersede(
  oldId: string,
  newFact: { fact: string; cycle: number; subjectKey?: string },
): Promise<WorldFactRecord> {
  const old = await prisma.worldFact.findUnique({ where: { id: oldId } });
  if (!old) throw new NotFoundError(`WorldFact not found: ${oldId}`);

  const created = await prisma.worldFact.create({
    data: {
      campaignId: old.campaignId,
      subjectKey: newFact.subjectKey ?? old.subjectKey,
      fact: newFact.fact,
      establishedAtCycle: newFact.cycle,
    },
  });

  await prisma.worldFact.update({
    where: { id: old.id },
    data: { supersededById: created.id },
  });

  return created;
}
