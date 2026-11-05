import { prisma as p } from '../app/src/lib/db';
(async () => {
  const items = await p.campaignItem.findMany({ where: { name: { contains: 'Pizza' } } });
  for (const it of items) { const { data, description, ...rest } = it as any; console.log(JSON.stringify(rest)); }
  await p.$disconnect();
})();
