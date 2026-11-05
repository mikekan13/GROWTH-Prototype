import { prisma } from '../app/src/lib/db';
import { loadWorldLevel, beingStanding } from '../app/src/services/spatial-world';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const p = prisma as any;
  const { map } = await loadWorldLevel(CAMP);
  for (const [n, id] of [['Violet', 'cms60ndtn0000kw48ioq10i68'], ['Kristopher', 'cmvcbw49u0001h448qanzbhs3']]) { const s = await beingStanding(map, id); console.log(n, 'in', s?.room?.name, JSON.stringify(s?.point)); }
  const pizza = await p.campaignItem.findUnique({ where: { id: 'cmvcbwayx0000p848640u05g2' }, select: { holderId: true } });
  const camp = await prisma.campaign.findUnique({ where: { id: CAMP }, select: { currentCycle: true } });
  const sessions = await p.gameSession.count({ where: { campaignId: CAMP } });
  const lk = await p.lastKnown.count({ where: { campaignId: CAMP } });
  const things = await p.campaignItem.count({ where: { campaignId: CAMP, status: 'ACTIVE', holderId: null, locationId: { not: null } } });
  console.log('pizza held by Kristopher:', pizza?.holderId === 'cmvcbw49u0001h448qanzbhs3', '| clock', camp?.currentCycle, '| sessions', sessions, '| lastKnown rows', lk, '| floor things', things, '| doors', map.portals.map((q) => `${q.name}:${q.state ?? 'open'}`).join(', '));
  process.exit(0);
})();
