import { prisma as p } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const rows = await p.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gte: new Date('2026-10-31T04:06:00Z') } }, orderBy: { createdAt: 'asc' }, select: { type: true, payload: true, createdAt: true } });
  for (const r of rows) console.log(r.createdAt.toISOString().slice(11,19), r.type, r.payload.slice(0, 1200).replace(/\s+/g,' '));
  const pizza = await p.item.findFirst({ where: { name: { contains: 'Pizza' } }, select: { name: true, id: true } }).catch(() => null);
  console.log('pizza item', pizza);
  await p.$disconnect();
})();
