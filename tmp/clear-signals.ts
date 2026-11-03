import { prisma } from '../app/src/lib/db';
(async () => {
  const rows = await prisma.campaignItem.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', data: { contains: '"signal"' } }, select: { id: true, name: true, data: true } });
  for (const r of rows) { const d = JSON.parse(r.data); delete d.signal; await prisma.campaignItem.update({ where: { id: r.id }, data: { data: JSON.stringify(d) } }); console.log('cleared signal on', r.name); }
  console.log('signals cleared:', rows.length); process.exit(0);
})();
