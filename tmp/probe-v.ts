import { prisma } from '../app/src/lib/db';
import { cycleToLocalDate } from '../app/src/types/time';
import { ensureDefaultTimescale } from '../app/src/services/time';
(async () => {
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { currentCycle: true } });
  const ts = await ensureDefaultTimescale('cms5z4j6z0000zg48z5vzl2jn') as any;
  console.log('clock', camp.currentCycle, JSON.stringify(cycleToLocalDate(camp.currentCycle, ts)));
  const e = await prisma.dayaEntity.findUnique({ where: { characterId: 'cms60ndtn0000kw48ioq10i68' }, select: { id: true } });
  const mem = await prisma.dayaMemoryEntry.findMany({ where: { entityId: e!.id, OR: [{ content: { contains: 'cheek' } }, { content: { contains: 'box' } }, { content: { contains: 'Hawaiian' } }] }, orderBy: { realTime: 'desc' }, take: 10, select: { realTime: true, source: true, content: true } });
  for (const m of mem) console.log(m.realTime.toISOString().slice(0, 16), m.source, '|', m.content.replace(/\s+/g, ' ').slice(0, 150));
  const ints = await prisma.dayaIntention.findMany({ where: { entityId: e!.id, status: 'PENDING' }, select: { description: true } });
  console.log('pending intentions:', ints.map((i) => i.description.slice(0, 100)));
  process.exit(0);
})();
