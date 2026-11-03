import { prisma } from '../app/src/lib/db';
(async () => {
  const e = await prisma.dayaEntity.findUnique({ where: { characterId: 'cmvcbw49u0001h448qanzbhs3' }, select: { id: true } });
  const r = await prisma.dayaIntention.deleteMany({ where: { entityId: e!.id, createdAt: { gte: new Date('2026-11-01T00:46:00Z'), lt: new Date('2026-11-01T00:57:00Z') }, authority: 'self' } });
  console.log('Kristopher stretch self-intentions removed:', r.count);
  process.exit(0);
})();
