import { prisma as p } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const rows = await p.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gte: new Date('2026-10-31T04:00:00Z') } }, orderBy: { createdAt: 'asc' }, select: { type: true, payload: true, createdAt: true } });
  for (const r of rows) console.log(r.createdAt.toISOString().slice(11,19), r.type, r.payload.slice(0, 900).replace(/\s+/g,' '));
  await p.$disconnect();
})();
