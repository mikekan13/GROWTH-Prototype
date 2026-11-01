import { prisma } from '../app/src/lib/db';
(async () => {
  const e = await prisma.dayaEntity.findUnique({ where: { characterId: 'cmvcbw49u0001h448qanzbhs3' }, select: { id: true } });
  const rows = await prisma.dayaIntention.findMany({ where: { entityId: e!.id }, orderBy: { createdAt: 'asc' }, select: { id: true, status: true, cadence: true, trigger: true, authority: true, dueCycle: true, dueUntil: true, description: true, createdAt: true } });
  for (const r of rows) console.log(`${r.createdAt.toISOString().slice(5, 16)} ${r.status.padEnd(8)} cad=${r.cadence ?? '-'} trig=${(r.trigger ?? '-').slice(0, 30)} auth=${r.authority} due=${r.dueCycle?.toFixed(4) ?? '-'}..${r.dueUntil?.toFixed(4) ?? '-'} | ${r.description.replace(/\s+/g, ' ').slice(0, 110)}`);
  process.exit(0);
})();
