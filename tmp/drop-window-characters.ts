import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const from = new Date(process.argv[2] ?? '2026-11-05T11:08:00Z');
  const rows = await prisma.character.findMany({ where: { campaignId: C, createdAt: { gte: from } }, select: { id: true, name: true, entityType: true, status: true } });
  console.log(rows);
  if (!process.argv.includes('--apply')) { console.log('(dry run)'); process.exit(0); }
  const ids = rows.map((r) => r.id);
  const p = prisma as any;
  await p.entityRelationship.deleteMany({ where: { OR: [{ sourceId: { in: ids } }, { targetId: { in: ids } }] } }).catch(() => undefined);
  await p.dayaEntity.deleteMany({ where: { characterId: { in: ids } } }).catch(() => undefined);
  await prisma.campaignItem.updateMany({ where: { holderId: { in: ids } }, data: { holderId: null } }).catch(() => undefined);
  const r = await prisma.character.deleteMany({ where: { id: { in: ids } } });
  console.log('deleted', r.count);
  process.exit(0);
})();
