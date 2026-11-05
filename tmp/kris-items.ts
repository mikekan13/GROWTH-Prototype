import { prisma } from '../app/src/lib/db';
const K = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const held = await prisma.campaignItem.findMany({ where: { holderId: K }, select: { id: true, name: true, status: true } });
  const edges = await prisma.entityRelationship.findMany({ where: { OR: [{ sourceId: K }, { targetId: K }] }, select: { sourceId: true, targetId: true, relationshipType: true, targetType: true } });
  console.log('held', JSON.stringify(held));
  console.log('edges', JSON.stringify(edges));
  const named = await prisma.campaignItem.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', name: { in: ['Smartphone', 'Ballpoint Pen', 'Sticky Note Pad', 'Laptop'] } }, select: { id: true, name: true, holderId: true, createdAt: true } });
  console.log('named', JSON.stringify(named));
  const d = JSON.parse((await prisma.character.findUniqueOrThrow({ where: { id: K } })).data);
  console.log('sheet inventory keys', Object.keys(d).filter(k => /inv|poss|equip|item/i.test(k)).join(','), JSON.stringify(d.inventory ?? d.possessions ?? null).slice(0, 300));
  process.exit(0);
})();
