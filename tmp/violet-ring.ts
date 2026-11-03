import { prisma } from '../app/src/lib/db';
(async () => {
  const e = await prisma.dayaEntity.findUnique({ where: { characterId: 'cms60ndtn0000kw48ioq10i68' }, select: { id: true } });
  const mem = await prisma.dayaMemoryEntry.findMany({ where: { entityId: e!.id }, orderBy: { realTime: 'desc' }, take: 8, select: { realTime: true, source: true, perceivedVia: true, content: true } });
  for (const m of mem.reverse()) console.log(m.realTime.toISOString().slice(11, 19), m.source, m.perceivedVia, '|', m.content.replace(/\s+/g, ' ').slice(0, 220));
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', type: 'being_thought', characterName: 'Violet' }, orderBy: { createdAt: 'desc' }, take: 3, select: { payload: true } });
  for (const x of ev.reverse()) { const p = JSON.parse(x.payload); console.log('HEARD:', String(p.heard).slice(0, 300), '\n  THOUGHT:', String(p.thought).slice(0, 200)); }
  const phone = await prisma.campaignItem.findFirst({ where: { name: 'Her phone', status: 'ACTIVE' }, select: { holderId: true, data: true } });
  console.log('phone holder:', phone?.holderId, 'state:', JSON.parse(phone!.data).state ?? '-');
  process.exit(0);
})();
