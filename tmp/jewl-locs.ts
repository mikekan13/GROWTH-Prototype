import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const locs = await p.location.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { id: true, name: true, type: true, status: true, data: true } });
  for (const l of locs) { let d: any = {}; try { d = JSON.parse(l.data ?? '{}'); } catch {} console.log('LOC', l.id.slice(-6), l.name, l.type, l.status, 'parent', "-", 'level', d.level ?? d.floor ?? '-', 'keys', Object.keys(d).join(',').slice(0, 120)); }
  const rels = await p.entityRelationship.findMany({ where: { relationshipType: 'located_at', sourceId: { in: ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3', 'cmvaeknss0009bc48s7ulk6ca'] } } });
  for (const r of rels) console.log('AT', r.sourceId.slice(-6), '->', r.targetId.slice(-6), r.targetType);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
