import { prisma } from '@/lib/db';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const items = await prisma.campaignItem.findMany({ where: { campaignId: camp!.id, holderId: null }, select: { id: true, name: true, locationId: true } });
  const edges = await prisma.entityRelationship.findMany({ where: { campaignId: camp!.id, relationshipType: 'located_at', sourceType: 'ITEM' }, select: { sourceId: true, targetId: true, targetType: true } });
  const edgeOf = new Map(edges.map(e => [e.sourceId, e]));
  let noLoc = 0, noEdge = 0;
  for (const it of items) { if (!it.locationId) noLoc++; if (!edgeOf.has(it.id)) noEdge++; }
  console.log('unheld items', items.length, 'locationId null', noLoc, 'no located_at edge', noEdge);
  console.log(items.filter(i => !i.locationId).slice(0, 6).map(i => `${i.name} edge->${edgeOf.get(i.id)?.targetType ?? 'none'}`).join(' | '));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
