import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const rows = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE', name: { in: ['Delivery bag (window)', 'Run board (back room)'] } } });
  writeFileSync(`data/archive/dedupe-stock-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify(rows, null, 2));
  for (const r of rows) {
    await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: r.id }, { targetId: r.id }] } });
    await prisma.campaignItem.delete({ where: { id: r.id } });
    console.log('removed duplicate', r.name);
  }
  process.exit(0);
})();
