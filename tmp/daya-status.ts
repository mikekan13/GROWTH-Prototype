import { prisma } from '../app/src/lib/db';
(async () => { const es = await (prisma as any).dayaEntity.findMany({ where: { character: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' } }, select: { id: true, status: true, character: { select: { name: true, entityType: true, userId: true } } } });
  console.log(JSON.stringify(es)); process.exit(0); })().catch(e => { console.error(e.message); process.exit(1); });
