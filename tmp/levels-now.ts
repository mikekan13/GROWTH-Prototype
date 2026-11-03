import { prisma } from '../app/src/lib/db';
import { levelOfBeing, roomIdOf } from '../app/src/services/spatial-world';
(async () => {
  for (const [n, id] of [['Violet', 'cms60ndtn0000kw48ioq10i68'], ['Kristopher', 'cmvcbw49u0001h448qanzbhs3']]) {
    const room = await roomIdOf(id); const loc = room ? await prisma.location.findUnique({ where: { id: room }, select: { name: true } }) : null;
    console.log(n, 'room', loc?.name, 'level', await levelOfBeing(id));
  }
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gte: new Date('2026-11-03T02:27:00Z') } }, orderBy: { createdAt: 'asc' }, select: { type: true, payload: true } });
  for (const e of ev) { const p = JSON.parse(e.payload); console.log(e.type, p.eventType ?? p.kind, 'source=', p.sourceId ?? p.actorId ?? (p.actions?.[0]?.actorId) ?? '-', 'loc=', p.locationId ?? '-'); }
  const canon = await (prisma as any).canonEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gte: new Date('2026-11-03T02:27:00Z') } }, select: { sourceId: true, locationId: true, actorId: true } }).catch((e: Error) => [{ err: e.message.split('\n')[0] }]);
  console.log('canon', JSON.stringify(canon).slice(0, 500));
  process.exit(0);
})();
