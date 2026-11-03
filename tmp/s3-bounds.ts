import { prisma } from '../app/src/lib/db';
(async () => {
  const C = 'cms5z4j6z0000zg48z5vzl2jn';
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: C, payload: { contains: 'session_' } }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, createdAt: true, payload: true, sessionId: true } });
  for (const e of ev) console.log(e.createdAt.toISOString(), e.sessionId, JSON.parse(e.payload).description);
  const gs = await prisma.gameSession.findMany({ where: { campaignId: C }, orderBy: { createdAt: 'desc' }, take: 3 }).catch(() => []);
  console.log(JSON.stringify(gs).slice(0, 600));
  const camp = await prisma.campaign.findUnique({ where: { id: C }, select: { currentCycle: true } }); console.log('cycle', camp?.currentCycle);
  process.exit(0);
})();
