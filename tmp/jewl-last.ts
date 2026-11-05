import { prisma } from '../app/src/lib/db';
(async () => {
  const rows = await (prisma as any).copilotMessage.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gt: new Date(Date.now() - 20 * 60_000) } }, orderBy: { createdAt: 'asc' } });
  for (const m of rows) console.log('#', m.createdAt.toISOString().slice(11, 19), m.role, m.contentClass ?? '', String(m.content).slice(0, 700).replace(/\n/g, ' / '));
  process.exit(0);
})();
