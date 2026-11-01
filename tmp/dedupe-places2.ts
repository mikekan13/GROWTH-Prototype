import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const OLD_ROOM = 'cmvx73umt0003vg48gckkcu1l', OLD_LOT = 'cmvx73un10005vg48i6r02ran';
const NEW_ROOM = 'cmvx7ddl90016vg48t3xhwmmf', NEW_LOT = 'cmvx7dojt0019vg48ue45siw5';
(async () => {
  for (const [oldId, newId] of [[OLD_ROOM, NEW_ROOM], [OLD_LOT, NEW_LOT]]) {
    const items = await prisma.campaignItem.findMany({ where: { locationId: oldId, status: 'ACTIVE' }, select: { id: true, name: true } });
    for (const it of items) {
      await prisma.$transaction([
        prisma.entityRelationship.deleteMany({ where: { sourceId: it.id, relationshipType: 'located_at' } }),
        prisma.entityRelationship.create({ data: { campaignId: C, sourceId: it.id, sourceType: 'CAMPAIGN_ITEM', targetId: newId, targetType: 'LOCATION', relationshipType: 'located_at', strength: 5 } }),
        prisma.campaignItem.update({ where: { id: it.id }, data: { locationId: newId } }),
      ]);
      console.log(`moved "${it.name}" → ${newId}`);
    }
    const chars = await prisma.entityRelationship.findMany({ where: { targetId: oldId, relationshipType: 'located_at', sourceType: 'CHARACTER' } });
    for (const e of chars) { await prisma.entityRelationship.update({ where: { id: e.id }, data: { targetId: newId } }); console.log('re-pointed a character edge'); }
    const d = await prisma.location.findUnique({ where: { id: oldId } });
    writeFileSync(`data/archive/dedupe-${oldId}.json`, JSON.stringify(d, null, 2));
    await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: oldId }, { targetId: oldId }] } });
    await prisma.lastKnown.deleteMany({ where: { subjectId: oldId } }).catch(() => undefined);
    await prisma.location.delete({ where: { id: oldId } });
    console.log(`removed ${d?.name} (${oldId})`);
  }
  process.exit(0);
})();
