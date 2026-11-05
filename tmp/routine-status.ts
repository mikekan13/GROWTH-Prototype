import { prisma as p } from '../app/src/lib/db';
(async () => {
  const r = await p.dayaRoutine.findMany({ where: { entity: { character: { name: 'Violet' } } }, select: { name: true, status: true, cursor: true, steps: true, startedCycle: true, lastDoneCycle: true } });
  console.log(JSON.stringify(r));
  const c = await p.campaign.findUnique({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { currentCycle: true } });
  console.log('cycle', c?.currentCycle);
  await p.$disconnect();
})();
