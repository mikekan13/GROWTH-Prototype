import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', payload: { contains: 'Take your time' } }, select: { id: true, type: true, payload: true } });
  console.log('events', ev.map(e => e.id + ' ' + e.type).join(', '));
  const canon = await p.canonEvent?.findMany?.({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', narration: { contains: 'Take your time' } }, select: { id: true, narration: true, detail: true } }).catch((e: any) => 'err ' + e.message.slice(0, 100));
  console.log('canon', JSON.stringify(canon).slice(0, 600));
  const mem = await p.dayaMemoryEntry.findMany({ where: { content: { contains: 'ake your time' } }, select: { id: true, entityId: true, content: true } });
  console.log('memories', JSON.stringify(mem).slice(0, 800));
  process.exit(0);
})();
