/** Mike's vine check-in answer (17 Oct): "2. should be decide to go to trial or take the plea deal. 4. Is find real love that feels as reciprocal to kind he gives". JEWL has no tool to change a seated goal. */
import { prisma } from '../app/src/lib/db';
const SID = 'cmvccda300001yc48xnp1f8vx';
(async () => {
  const p = prisma as any;
  await p.goal.update({ where: { id: 'cmvce8vtm000a2o48rn5blq2k' }, data: { description: 'Decide whether to go to trial or take the plea deal.', authoredBy: 'gm' } });
  await p.goal.update({ where: { id: 'cmvce8vts000c2o4876ty6miw' }, data: { description: 'Find real love that feels as reciprocal as the kind he gives.', authoredBy: 'gm' } });
  const s = await prisma.dayaWorkSession.findUniqueOrThrow({ where: { id: SID } });
  await prisma.dayaWorkSession.update({ where: { id: SID }, data: { status: 'active', blockedReason: null, progress: JSON.stringify([...JSON.parse(s.progress), '[system] GM correction applied to the seated goals: #2 = trial or plea deal; #4 = reciprocal love. All 4 vines final — VINES done; go on.']) } });
  console.log('ok');
  process.exit(0);
})();
