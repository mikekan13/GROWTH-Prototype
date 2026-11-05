import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const camp = 'cms5z4j6z0000zg48z5vzl2jn';
  const facts = await p.worldFact.findMany({ where: { campaignId: camp, supersededById: null }, select: { subjectKey: true, fact: true, establishedAtCycle: true } });
  console.log('FACTS', facts.length);
  for (const f of facts) console.log(' ', f.subjectKey, '|', String(f.fact).replace(/\s+/g,' ').slice(0, 150));
  const goals = await p.goal.findMany({ where: { campaignId: camp }, select: { characterId: true, status: true, description: true, priority: true } });
  for (const g of goals) console.log('GOAL', g.characterId.slice(-6), g.status, g.priority, '|', g.description.slice(0, 100));
  for (const [name, eid] of [['Violet','cmv57ezn2000lds4859pxeux4'],['Kris','cmvccodq2001tyc486jp89cwk']]) {
    const n = await p.dayaMemoryEntry.count({ where: { entityId: eid } });
    const bySrc = await p.dayaMemoryEntry.groupBy({ by: ['source'], where: { entityId: eid }, _count: true });
    console.log(name, 'memories', n, bySrc.map((b: any) => `${b.source}:${b._count}`).join(' '));
    const last = await p.dayaMemoryEntry.findFirst({ where: { entityId: eid }, orderBy: { narrativeCycle: 'desc' }, select: { narrativeCycle: true, source: true, content: true } });
    console.log('  last', last?.narrativeCycle, last?.source, String(last?.content).replace(/\s+/g,' ').slice(0, 120));
  }
  const items = await p.campaignItem.findMany({ where: { campaignId: camp, status: 'ACTIVE' }, select: { name: true, holderId: true, locationId: true } });
  console.log('ITEMS', items.length, items.map((i: any) => `${i.name}${i.holderId ? '@' + i.holderId.slice(-4) : ''}`).join(', ').slice(0, 600));
  const locs = await p.location?.findMany?.({ where: { campaignId: camp }, select: { id: true, name: true, parentId: true } }).catch(() => []);
  console.log('LOCATIONS', (locs ?? []).map((l: any) => l.name).join(', '));
  const ts = await p.timescale?.findFirst?.({ where: { campaignId: camp } }).catch(() => null);
  console.log('TIMESCALE', ts ? JSON.stringify({ unitsPerMetaCycle: ts.unitsPerMetaCycle, unitName: ts.unitName, calendar: ts.calendar ? String(ts.calendar).slice(0, 200) : null }) : 'none');
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
