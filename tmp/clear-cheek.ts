import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
(async () => {
  const C = 'cms5z4j6z0000zg48z5vzl2jn';
  const bad = await prisma.worldFact.findMany({ where: { campaignId: C, subjectKey: 'violet.phone_position' } });
  writeFileSync(`data/archive/violet-phone-position-${Date.now()}.json`, JSON.stringify(bad, null, 1));
  await prisma.worldFact.updateMany({ where: { supersededById: { in: bad.map((b) => b.id) } }, data: { supersededById: null } });
  await prisma.worldFact.deleteMany({ where: { id: { in: bad.map((b) => b.id) } } });
  console.log('removed', bad.length, 'violet.phone_position facts');
  const k = await prisma.worldFact.findMany({ where: { campaignId: C, supersededById: null, establishedAtCycle: { gt: 0.0022 }, subjectKey: { startsWith: 'kristopher' }, NOT: { subjectKey: { startsWith: 'kristopher_hotel.' } } }, select: { subjectKey: true, fact: true, establishedAtCycle: true } });
  for (const x of k) console.log('K', x.establishedAtCycle.toFixed(5), x.subjectKey, '|', x.fact.slice(0, 130));
  process.exit(0);
})();
