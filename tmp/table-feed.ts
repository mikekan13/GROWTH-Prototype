import { prisma } from '../app/src/lib/db';
(async () => {
  const mins = Number(process.argv[2] ?? 25);
  const rows = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gt: new Date(Date.now() - mins * 60_000) } }, orderBy: { createdAt: 'asc' } });
  for (const r of rows) console.log(r.createdAt.toISOString().slice(11, 19), r.type, r.actorName, r.characterName ?? '', '|', r.payload.slice(0, 300).replace(/\n/g, ' / '));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
