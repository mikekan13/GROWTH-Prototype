import { prisma } from '../app/src/lib/db';
(async () => {
  const f = await prisma.worldFact.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', supersededById: null, OR: [{ subjectKey: { startsWith: 'violet' } }, { fact: { contains: 'Violet' } }] }, select: { id: true, subjectKey: true, fact: true, establishedAtCycle: true }, orderBy: { establishedAtCycle: 'asc' } });
  for (const x of f) console.log(x.id, x.establishedAtCycle.toFixed(5), x.subjectKey, '|', x.fact.slice(0, 140));
  process.exit(0);
})();
