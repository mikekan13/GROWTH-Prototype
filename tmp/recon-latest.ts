import { prisma } from '../app/src/lib/db';
(async () => {
  const r = await (prisma as any).reconciliation.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, orderBy: { createdAt: 'desc' }, take: 2 });
  for (const x of r) console.log(JSON.stringify(x, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 2500));
  process.exit(0);
})();
