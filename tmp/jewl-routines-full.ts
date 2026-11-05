import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const rs = await p.dayaRoutine.findMany({ include: { entity: { select: { character: { select: { name: true } } } } } });
  for (const r of rs) console.log(`ROUTINE ${r.entity.character.name} | ${r.name} | ${r.status} cadence=${r.cadence} cursor=${r.cursor} steps=${r.steps} started=${r.startedCycle} lastDone=${r.lastDoneCycle}\n  triggers=${r.triggers}\n  ends=${r.ends}\n  src=${r.sourceIntentionIds}`);
  const ents = await p.dayaEntity.findMany({ where: { character: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' } } });
  for (const e of ents) { const { id, characterId, ...rest } = e; console.log('ENTITY', characterId.slice(-6), JSON.stringify(rest).slice(0, 400)); }
  const chars = await p.character.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { id: true, name: true, entityType: true, status: true, locationId: true, data: true } });
  for (const c of chars) { let d: any = {}; try { d = JSON.parse(c.data); } catch {} console.log('CHAR', c.name, c.entityType, c.status, 'locationId=', c.locationId, 'sex=', d.identity?.sex, 'keys=', Object.keys(d).join(',').slice(0, 200)); }
  const rels = await p.entityRelationship.findMany({ where: { relationshipType: { in: ['located_at', 'located_in', 'at'] } }, select: { sourceId: true, targetId: true, relationshipType: true } });
  console.log('LOCATED rels', rels.length, JSON.stringify(rels.slice(0, 10)));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
