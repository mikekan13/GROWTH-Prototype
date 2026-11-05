import { prisma } from '../app/src/lib/db';
(async () => {
  const ms = await (prisma as any).dayaMemoryEntry.findMany({ where: { content: { startsWith: 'It' } }, select: { content: true }, take: 5 });
  for (const m of ms) console.log(JSON.stringify(m.content.slice(0, 40)), [...m.content.slice(0, 4)].map((c) => c.codePointAt(0)!.toString(16)));
  const items = await (prisma as any).campaignItem.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', status: 'ACTIVE', holderId: { not: null } }, select: { name: true, story: true, holderId: true } });
  console.log('held items', items.length);
  for (const i of items.slice(0, 40)) console.log('*', i.name, '::', (i.story ?? '').slice(0, 70));
  process.exit(0);
})();
