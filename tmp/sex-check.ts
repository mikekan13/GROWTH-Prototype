import { prisma } from '../app/src/lib/db';
(async () => {
  const cs = await prisma.character.findMany({ where: { status: { not: 'RETIRED' } }, select: { name: true, data: true } });
  for (const c of cs) { const d = JSON.parse(c.data); console.log(c.name, '| sex', JSON.stringify(d.identity?.sex), '| gender', JSON.stringify(d.identity?.gender)); }
  process.exit(0);
})();
