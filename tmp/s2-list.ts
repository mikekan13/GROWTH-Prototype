import { prisma } from '../app/src/lib/db';
(async () => {
  const win = { gte: new Date('2026-11-01T03:33:00Z'), lt: new Date('2026-11-03T01:25:20Z') };
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: win }, select: { createdAt: true, type: true, payload: true } });
  for (const e of ev) console.log(e.createdAt.toISOString(), e.type, e.payload.replace(/\s+/g, ' ').slice(0, 120));
  process.exit(0);
})();
