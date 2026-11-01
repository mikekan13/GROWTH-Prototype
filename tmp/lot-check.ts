import { prisma } from '../app/src/lib/db';
(async () => {
  const lot = await prisma.location.findUnique({ where: { id: 'cmvx7dojt0019vg48ue45siw5' }, select: { name: true, data: true } });
  const d = JSON.parse(lot!.data || '{}');
  console.log('lot footprint:', d.footprint ? `${d.footprint.points?.length} pts, scale ${d.footprint.scale}` : 'none', '| openings:', (d.openings ?? []).length, '| tokens:', JSON.stringify(d.tokens ?? d.footprint?.tokens ?? null)?.slice(0, 300));
  const kids = await prisma.entityRelationship.findMany({ where: { targetId: 'cmvx7dojt0019vg48ue45siw5', relationshipType: 'located_at', sourceType: 'LOCATION' }, select: { sourceId: true } });
  for (const k of kids) { const r = await prisma.location.findUnique({ where: { id: k.sourceId }, select: { name: true, data: true } }); const rd = JSON.parse(r!.data || '{}'); console.log(' room', r!.name, rd.footprint ? `${rd.footprint.points?.length} pts` : 'undrawn'); }
  const items = await prisma.campaignItem.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', status: 'ACTIVE', OR: [{ locationId: 'cmvx7dojt0019vg48ue45siw5' }, { locationId: { in: kids.map((k) => k.sourceId) } }] }, select: { name: true, data: true } });
  for (const it of items) { const id = JSON.parse(it.data || '{}'); console.log(' item', it.name, 'mapShape:', !!id.mapShape, 'point:', JSON.stringify(id.mapPoint ?? id.point ?? null)); }
  const k = await prisma.character.findUnique({ where: { id: 'cmvcbw49u0001h448qanzbhs3' }, select: { data: true } });
  const kd = JSON.parse(k!.data || '{}'); console.log('Kristopher canvas/point:', JSON.stringify(kd.canvas ?? kd.mapPoint ?? kd.position ?? null)?.slice(0, 200));
  process.exit(0);
})();
