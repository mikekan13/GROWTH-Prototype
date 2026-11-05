import { prisma as p } from '../app/src/lib/db';
(async () => {
  const locs = await p.location.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { name: true, parentId: true } });
  console.log(locs.map(l => l.name).join(' | '));
  await p.$disconnect();
})();
