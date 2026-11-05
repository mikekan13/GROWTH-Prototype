import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const locs = await p.location.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { id: true, name: true, data: true } });
  for (const l of locs) { const d = JSON.parse(l.data ?? '{}'); console.log('LOC', l.id.slice(-6), l.name, '| footprint:', d.footprint ? 'yes' : 'no', '| openings:', JSON.stringify(d.openings ?? null)?.slice(0, 700)); }
  const rels = await p.entityRelationship.findMany({ where: { relationshipType: 'located_at', sourceType: 'LOCATION' }, select: { sourceId: true, targetId: true } });
  console.log('LOC->LOC', rels.map((r: any) => `${r.sourceId.slice(-6)}->${r.targetId.slice(-6)}`).join(' '));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
