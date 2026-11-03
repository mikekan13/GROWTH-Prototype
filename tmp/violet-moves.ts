import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const h = await p.historyEntry.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', subjectId: 'cms60ndtn0000kw48ioq10i68' }, orderBy: { realTime: 'desc' }, take: 8, select: { realTime: true, type: true, summary: true } });
  for (const x of h) console.log(x.realTime.toISOString(), x.type, x.summary?.slice(0, 160));
  const edge = await p.entityRelationship.findMany({ where: { sourceId: 'cms60ndtn0000kw48ioq10i68', relationshipType: 'located_at' }, select: { targetId: true, createdAt: true, updatedAt: true } });
  console.log('edges', JSON.stringify(edge));
  const c = await prisma.character.findUnique({ where: { id: 'cms60ndtn0000kw48ioq10i68' }, select: { data: true } });
  const d = JSON.parse(c!.data); console.log('canvas', d.canvasX, d.canvasY, d.canvasPlacedAt ? new Date(d.canvasPlacedAt).toISOString() : '-');
  process.exit(0);
})();
