/** Mike's chat answer about the marriages landed on the "what does he want" prod; the marriage prod stayed OPEN and held the session. */
import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const want = await p.genesisProd.findUniqueOrThrow({ where: { id: 'cmvcdtrzf003pw048v1f05nl7' } });
  await p.genesisProd.update({ where: { id: 'cmvcdtnuc003mw048nxhhd58s' }, data: { status: 'ANSWERED', answer: want.answer, decidedById: want.decidedById, decidedAt: want.decidedAt ?? new Date() } });
  await p.genesisProd.update({ where: { id: want.id }, data: { status: 'OPEN', answer: null, decidedById: null, decidedAt: null } });
  console.log('moved');
  process.exit(0);
})();
