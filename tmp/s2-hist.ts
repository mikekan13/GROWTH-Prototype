import { prisma } from '../app/src/lib/db';
(async () => {
  const h = await (prisma as any).historyEntry.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', realTime: { gte: new Date('2026-11-01T03:33:00Z'), lt: new Date('2026-11-03T01:25:20Z') } } });
  for (const x of h) console.log(x.realTime.toISOString(), JSON.stringify(x).slice(0, 220));
  process.exit(0);
})();
