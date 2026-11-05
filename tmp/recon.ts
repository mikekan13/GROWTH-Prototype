import { prisma } from '../app/src/lib/db';
(async () => { const rows = await (prisma as any).reconciliation.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, orderBy: { createdAt: 'desc' }, take: 5 });
  for (const r of rows) { const { campaignId, ...x } = r; console.log(JSON.stringify(x).slice(0, 900)); } process.exit(0); })();
