import { prisma } from '../app/src/lib/db';
(async () => {
  const l = await prisma.location.findUnique({ where: { id: 'cmvahhpg00001ss48yarg3fbg' }, select: { data: true } });
  const d = JSON.parse((l as any).data);
  console.log('features:', JSON.stringify(d.features).slice(0, 700));
  console.log('spec:', JSON.stringify(d.spec).slice(0, 300));
  process.exit(0);
})();
