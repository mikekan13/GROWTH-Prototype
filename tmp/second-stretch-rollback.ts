import { prisma } from '../app/src/lib/db';
import { writeFileSync } from 'node:fs';
const T = new Date('2026-11-01T00:55:27.290Z');
async function main() {
  const mem = await prisma.dayaMemoryEntry.findMany({ where: { realTime: { gt: T } } });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(`data/archive/second-stretch-rollback-${stamp}.json`, JSON.stringify({ reason: 'duplicate advance_clock queued by a resend 2026-11-01T00:47Z; killed after window 1; these rows were its only writes', memories: mem }, null, 2));
  const del = await prisma.dayaMemoryEntry.deleteMany({ where: { id: { in: mem.map((m) => m.id) } } });
  console.log('archived + deleted memories:', del.count);
  const camp = await prisma.campaign.findUnique({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { currentCycle: true } });
  console.log('clock stays at', camp?.currentCycle, '(end of the first stretch)');
}
main().finally(() => prisma.$disconnect());
