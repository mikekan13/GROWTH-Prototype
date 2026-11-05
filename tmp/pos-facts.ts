import { prisma } from '../app/src/lib/db';
(async () => {
  const facts = await (prisma as any).worldFact.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', supersededById: null }, select: { subjectKey: true, fact: true } });
  for (const f of facts.filter((f: any) => /position|stands|landing/i.test(f.subjectKey + ' ' + f.fact) && /kristopher|violet/i.test(f.fact))) console.log(f.subjectKey, '|', f.fact.slice(0, 140));
  process.exit(0);
})();
