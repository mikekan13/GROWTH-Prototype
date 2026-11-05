import { prisma } from '../app/src/lib/db';
(async () => {
  for (const n of ['Leather Wallet', 'Saucepan', 'Camp Stove', 'Baseball Cap']) {
    const i = await prisma.forgeItem.findFirst({ where: { name: n, type: 'item' }, select: { name: true, status: true, campaignId: true, isGlobal: true, data: true } });
    console.log(n, i?.status, i?.isGlobal, i?.campaignId ? 'campaign' : 'global', '\n ', i?.data.slice(0, 700));
  }
  process.exit(0);
})();
