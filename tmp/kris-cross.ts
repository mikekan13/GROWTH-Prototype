import { prisma } from '../app/src/lib/db';
(async () => {
  const id = 'cmvcg22af0003yg48e3w0q67l';
  const it = await prisma.campaignItem.findUniqueOrThrow({ where: { id } });
  console.log('holder', it.holderId, '| data', it.data.slice(0, 500));
  const e = await prisma.entityRelationship.findMany({ where: { OR: [{ sourceId: id }, { targetId: id }] }, select: { relationshipType: true, sourceId: true, targetId: true, data: true } });
  console.log(JSON.stringify(e).slice(0, 600));
  const items = await prisma.forgeItem.findMany({ where: { type: 'item', OR: [{ campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, { isGlobal: true }] }, select: { name: true } });
  console.log('coats:', items.filter(i => /coat|puffer|parka|down jacket|winter/i.test(i.name)).map(i => i.name).join(' | '));
  process.exit(0);
})();
