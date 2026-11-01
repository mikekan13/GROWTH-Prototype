import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const locs = await prisma.location.findMany({ where: { campaignId: C, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } });
  const parent = new Map((await prisma.entityRelationship.findMany({ where: { campaignId: C, relationshipType: 'located_at', sourceType: 'LOCATION' }, select: { sourceId: true, targetId: true } })).map((e) => [e.sourceId, e.targetId]));
  const lname = new Map(locs.map((l) => [l.id, l.name]));
  for (const l of locs) console.log(`LOC ${l.name} ${JSON.parse(l.data || '{}').footprint ? '(drawn)' : '(undrawn)'} in ${lname.get(parent.get(l.id) ?? '') ?? '-'}`);
  for (const [cid, n] of [['cmvcbw49u0001h448qanzbhs3', 'Kristopher'], ['cms60ndtn0000kw48ioq10i68', 'Violet']]) {
    const at = await prisma.entityRelationship.findFirst({ where: { sourceId: cid, relationshipType: 'located_at' }, select: { targetId: true } });
    const held = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE', holderId: cid }, select: { name: true } });
    console.log(`${n} at ${lname.get(at?.targetId ?? '') ?? at?.targetId} | holds: ${held.map((h) => h.name).join('; ')}`);
  }
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE', holderId: null }, select: { name: true, locationId: true, data: true } });
  for (const name of ['Chess Pizza', 'The Hotel — Room 214', 'Hotel Parking Lot']) {
    const l = locs.find((x) => x.name === name); const here = items.filter((i) => i.locationId === l?.id);
    console.log(`IN ${name}: ${here.map((i) => `${i.name}${JSON.parse(i.data || '{}').parts ? ' [parts]' : ''}`).join('; ') || '(nothing)'}`);
  }
  const car = items.find((i) => /fusion/i.test(i.name)); console.log('car:', car?.name, 'in', lname.get(car?.locationId ?? '') ?? car?.locationId);
  process.exit(0);
})();
