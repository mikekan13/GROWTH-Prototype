import { prisma } from '../app/src/lib/db';
(async () => {
  const c = await prisma.character.findUniqueOrThrow({ where: { id: 'cmvcbw49u0001h448qanzbhs3' } });
  const d = JSON.parse(c.data); const des = d.identity?.designer;
  console.log('updated', c.updatedAt.toISOString(), 'refs', d.identity?.referencePhotos?.length);
  console.log(JSON.stringify(des ?? null).slice(0, 1500));
  const pg = await (prisma as any).portraitGeneration.findMany({ orderBy: { createdAt: 'desc' }, take: 4 });
  for (const g of pg) console.log('PG', g.characterId, g.createdAt.toISOString(), g.status, JSON.stringify(g).slice(0, 300));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
