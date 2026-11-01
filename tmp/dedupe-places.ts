import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const dups = await prisma.location.findMany({ where: { campaignId: C, id: { in: ['cmvx73umt0003vg48gckkcu1l', 'cmvx73un10005vg48i6r02ran'] } } });
  for (const d of dups) {
    const items = await prisma.campaignItem.count({ where: { locationId: d.id, status: 'ACTIVE' } });
    const edgesIn = await prisma.entityRelationship.count({ where: { targetId: d.id, relationshipType: 'located_at' } });
    console.log(`${d.name} (${d.status}): items=${items} located_at→it=${edgesIn}`);
    if (items || edgesIn) { console.log('  not empty — left alone'); continue; }
    writeFileSync(`data/archive/dedupe-${d.id}.json`, JSON.stringify(d, null, 2));
    await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: d.id }, { targetId: d.id }] } });
    await prisma.lastKnown.deleteMany({ where: { subjectId: d.id } }).catch(() => undefined);
    await prisma.location.delete({ where: { id: d.id } });
    console.log('  removed');
  }
  process.exit(0);
})();
