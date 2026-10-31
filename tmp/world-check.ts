import { prisma as p } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const camp = await p.campaign.findUnique({ where: { id: CAMP }, select: { name: true, currentCycle: true } });
  console.log('campaign', camp);
  const routines = await p.dayaRoutine.findMany({ select: { name: true, status: true, cursor: true, steps: true, entity: { select: { character: { select: { name: true } } } } } });
  for (const r of routines) console.log('routine', r.entity.character?.name, '|', r.name, r.status, 'cursor', r.cursor, 'steps', r.steps);
  const facts = await p.worldFact.findMany({ where: { campaignId: CAMP, supersededById: null, subjectKey: { contains: 'door' } }, select: { subjectKey: true, fact: true } });
  for (const f of facts) console.log('fact', f.subjectKey, '|', f.fact);
  const lines = await p.campaignEvent.count({ where: { campaignId: CAMP } }).catch(() => 'n/a');
  console.log('campaign events', lines);
  await p.$disconnect();
})();
