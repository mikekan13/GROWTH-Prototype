import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any; const C = 'cms5z4j6z0000zg48z5vzl2jn'; const since = new Date(Date.now() - 20 * 60 * 1000);
  const tries: Array<[string, () => Promise<unknown[]>]> = [
    ['godHeadMessage', () => p.godHeadMessage.findMany({ where: { campaignId: C, createdAt: { gte: since } }, take: 5 })],
    ['dayaWorkSession', () => p.dayaWorkSession.findMany({ where: { campaignId: C, updatedAt: { gte: since } }, take: 5 })],
    ['jewlMistake', () => p.jewlMistake.findMany({ where: { campaignId: C, createdAt: { gte: since } }, take: 5 })],
    ['canonReconciliation', () => p.canonReconciliation?.findMany({ where: { campaignId: C, createdAt: { gte: since } }, take: 5 }) ?? Promise.resolve([])],
    ['campaignEvent', () => prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 6, select: { createdAt: true, type: true, actor: true, payload: true } })],
  ];
  for (const [n, f] of tries) { try { const r = await f(); console.log(`${n}: ${r.length}`); for (const x of r) console.log('  ', JSON.stringify(x).slice(0, 500)); } catch (e) { console.log(n, 'n/a'); } }
  console.log('now', new Date().toISOString());
  process.exit(0);
})();
