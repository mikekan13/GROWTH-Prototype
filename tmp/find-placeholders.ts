import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any; const re = /\b(?:Person|Place|Thing|Org|User)-[A-Z]{1,2}\b/;
  const pick = (rows: any[], f: string) => rows.filter((r) => re.test(String(r[f] ?? ''))).map((r) => `${r.createdAt ?? r.realTime ?? ''} ${String(r[f]).slice(0, 140)}`);
  const mem = await p.dayaMemoryEntry.findMany({ where: { content: { contains: '-' } }, select: { content: true, realTime: true }, orderBy: { realTime: 'desc' }, take: 4000 });
  console.log('memories:', pick(mem, 'content').slice(0, 8));
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { payload: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 600 });
  console.log('events:', pick(ev, 'payload').slice(0, 8));
  const it = await p.dayaIntention.findMany({ select: { description: true, createdAt: true }, take: 2000 }).catch(() => []);
  console.log('intentions:', pick(it, 'description').slice(0, 5));
  const facts = await p.worldFact.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { fact: true } });
  console.log('facts:', pick(facts, 'fact').slice(0, 5));
  process.exit(0);
})();
