import { prisma } from '../app/src/lib/db';
(async () => { const p = prisma as any;
  const pr = await p.genesisProd.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gt: new Date(Date.now() - 30 * 60_000) } } });
  console.log('prods', pr.length);
  const n = await p.userNotification?.findMany?.({ where: { createdAt: { gt: new Date(Date.now() - 30 * 60_000) } }, take: 5 }).catch(() => []);
  console.log('notifications', JSON.stringify(n).slice(0, 600));
  process.exit(0); })();
