import { prisma } from '@/lib/db';
prisma.character.findMany({ where: { name: { in: ['Violet', 'Kristopher'] }, campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { name: true, data: true } }).then(async rows => {
  for (const r of rows) { const d = JSON.parse(r.data); console.log(r.name, d.canvasX, d.canvasY); }
  console.log('probe sessions', await prisma.session.count({ where: { token: { startsWith: 'probe-' } } }));
  process.exit(0);
});
