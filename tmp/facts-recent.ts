import { prisma } from '../app/src/lib/db';
(async () => { const f = await prisma.worldFact.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', establishedAtCycle: { gte: 0.0077303 } }, select: { id: true, subjectKey: true, fact: true, establishedAtCycle: true } });
  for (const x of f) console.log(x.id, x.establishedAtCycle.toFixed(7), x.subjectKey, '|', x.fact.slice(0, 120)); process.exit(0); })();
