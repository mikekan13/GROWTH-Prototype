import { prisma } from '../app/src/lib/db';
(async () => {
  const k = await prisma.dayaEntity.findUnique({ where: { characterId: 'cmvcbw49u0001h448qanzbhs3' }, select: { id: true } });
  const rows = await prisma.familiarity.findMany({ where: { perceiverId: k!.id }, select: { subjectId: true, aspectKind: true, score: true } });
  console.log('Kristopher entity', k!.id, 'rows', rows.length, JSON.stringify(rows.filter((r) => r.subjectId === 'cms60ndtn0000kw48ioq10i68')));
  process.exit(0);
})();
