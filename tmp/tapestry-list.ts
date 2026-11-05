import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const ch = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true, name: true, entityType: true, status: true, createdAt: true } });
  const lo = await prisma.location.findMany({ where: { campaignId: C }, select: { id: true, name: true, type: true, status: true, createdAt: true } });
  const it = await prisma.campaignItem.findMany({ where: { campaignId: C }, select: { id: true, name: true, status: true, holderId: true, createdAt: true } });
  const f = (d: Date) => d.toISOString().slice(0, 10);
  console.log('CHARACTERS', ch.length); ch.forEach(x => console.log(' ', f(x.createdAt), x.status, x.entityType, x.name, x.id));
  console.log('LOCATIONS', lo.length); lo.forEach(x => console.log(' ', f(x.createdAt), x.status, x.type, x.name, x.id));
  const byStatus: Record<string, number> = {}; it.forEach(x => byStatus[x.status] = (byStatus[x.status] ?? 0) + 1);
  console.log('ITEMS', it.length, JSON.stringify(byStatus));
  process.exit(0);
})();
