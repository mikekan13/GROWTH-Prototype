import { prisma } from '../app/src/lib/db';
(async () => {
  const e = await prisma.dayaEntity.findUnique({ where: { characterId: 'cms60ndtn0000kw48ioq10i68' }, select: { id: true } });
  const mem = await prisma.dayaMemoryEntry.findMany({ where: { entityId: e!.id, realTime: { gte: new Date('2026-11-01T00:40:00Z') } }, orderBy: { realTime: 'asc' }, select: { id: true, realTime: true, narrativeCycle: true, source: true, content: true } });
  for (const m of mem) console.log(m.id, m.realTime.toISOString().slice(5, 19), m.narrativeCycle.toFixed(5), m.source, '|', m.content.replace(/\s+/g, ' ').slice(0, 170));
  process.exit(0);
})();
