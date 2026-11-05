import { prisma } from '../app/src/lib/db';
async function main() {
  const rows = await prisma.campaignItem.findMany({ where: { OR: [{ name: { contains: 'rope' } }, { name: { contains: 'Rope' } }, { name: { contains: 'komboskini' } }] }, select: { id: true, name: true, holderId: true, data: true, history: true } });
  for (const r of rows) console.log(r.id, r.name, r.holderId, r.data.slice(0, 700));
  const rels = await prisma.entityRelationship.findMany({ where: { sourceId: 'cmvalc1df00a0w048hqiwi5ar' } }).catch(() => []);
  const rel2 = await prisma.entityRelationship.findMany({ where: { sourceId: 'cmvalc1df00a0m048hqiwi5ar' }, select: { targetId: true, targetType: true, relationshipType: true } });
  console.log('cash rels', JSON.stringify(rel2), rels.length);
  const v = await prisma.character.findUnique({ where: { id: 'cms60ndtn0000kw48ioq10i68' }, select: { id: true } });
  const vloc = await prisma.entityRelationship.findFirst({ where: { sourceId: 'cms60ndtn0000kw48ioq10i68', relationshipType: 'located_at' }, select: { targetId: true } });
  const kloc = await prisma.entityRelationship.findFirst({ where: { sourceId: 'cmvcbw49u0001h448qanzbhs3', relationshipType: 'located_at' }, select: { targetId: true } });
  console.log('violet room', vloc?.targetId, 'kris room', kloc?.targetId, !!v);
}
main().finally(() => prisma.$disconnect());
