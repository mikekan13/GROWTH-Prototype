import { prisma } from '@/lib/db';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const items = await prisma.campaignItem.findMany({ where: { campaignId: camp!.id, status: 'ACTIVE' }, select: { id: true, name: true, holderId: true, locationId: true, data: true } });
  const edges = await prisma.entityRelationship.findMany({ where: { campaignId: camp!.id, relationshipType: 'located_at', sourceType: { in: ['ITEM','CAMPAIGN_ITEM'] } }, select: { sourceId: true, targetId: true, targetType: true, data: true } });
  const eById = new Map(edges.map(e => [e.sourceId, e]));
  let shaped = 0, positioned = 0;
  for (const it of items) {
    const d = JSON.parse(it.data || '{}');
    const e = eById.get(it.id);
    const ed = e?.data ? JSON.parse(e.data) : {};
    if (d.mapShape) shaped++;
    if (ed.position) positioned++;
    if (d.mapShape || ['Entry door','Bed','Low Wooden Table','Floor Lamp'].some(n => it.name.includes(n))) console.log(it.name, '| holder', it.holderId, '| loc', it.locationId, '| edge->', e?.targetType, '| pos', JSON.stringify(ed.position), '| shape', JSON.stringify(d.mapShape), '| sizeFt', JSON.stringify(d.sizeFt ?? d.size ?? null), '| x,y', d.x, d.y);
  }
  console.log('items', items.length, 'shaped', shaped, 'positioned', positioned, 'edges', edges.length, 'sourceTypes', [...new Set(edges.map(e=>e.targetType))]);
  const held = items.filter(i => i.holderId);
  console.log('held:', held.map(i => i.name + '@' + i.holderId).join(', '));
}
main().finally(() => prisma.$disconnect());
