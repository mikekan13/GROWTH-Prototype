import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const rows = await p.copilotMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 14 });
  for (const r of rows.reverse()) console.log('\n#', r.createdAt.toISOString(), r.role, '|', String(r.content).slice(0, 900));
  const k = await prisma.character.findUniqueOrThrow({ where: { id: 'cmvcbw49u0001h448qanzbhs3' } });
  const d = JSON.parse(k.data); console.log('\nKRIS age', JSON.stringify(d.identity?.age), JSON.stringify(d.age ?? null), 'seed', JSON.stringify(d.seed?.name ?? d.seedId ?? null));
  process.exit(0);
})();
