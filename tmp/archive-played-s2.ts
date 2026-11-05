import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any; const C = 'cms5z4j6z0000zg48z5vzl2jn'; const from = new Date('2026-11-03T03:46:40Z');
  const ents = (await p.dayaEntity.findMany({ where: { character: { campaignId: C } }, select: { id: true } })).map((e: any) => e.id);
  const out = {
    events: await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gte: from } } }),
    canon: await p.canonEvent.findMany({ where: { campaignId: C, createdAt: { gte: from } } }),
    memories: await p.dayaMemoryEntry.findMany({ where: { entityId: { in: ents }, realTime: { gte: from } } }),
    intentions: await p.dayaIntention.findMany({ where: { entityId: { in: ents }, createdAt: { gte: from } } }),
  };
  writeFileSync(`data/archive/played-session2-${Date.now()}.json`, JSON.stringify(out, null, 1));
  console.log('archived played session 2:', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, (v as unknown[]).length])));
  process.exit(0);
})();
