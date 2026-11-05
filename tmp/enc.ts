import { prisma } from '../app/src/lib/db';
(async () => { const rows = await (prisma as any).encounter.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, orderBy: { createdAt: 'desc' }, take: 4 });
  for (const r of rows) console.log(r.id, r.status, r.createdAt.toISOString(), String(r.name ?? r.title ?? ''), JSON.stringify(r).slice(0, 300)); process.exit(0); })().catch(e => { console.error(e.message); process.exit(1); });
