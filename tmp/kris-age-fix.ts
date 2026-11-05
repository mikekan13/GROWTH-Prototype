/** Mike 2026-10-17: "his age should add to 40". The brief carried the form's default AGE 25 while his backstory says 40. */
import { prisma } from '../app/src/lib/db';
const ID = 'cmvccda300001yc48xnp1f8vx';
(async () => {
  const s = await prisma.dayaWorkSession.findUniqueOrThrow({ where: { id: ID } });
  const plan = (s.plan.startsWith('AGE:') ? s.plan : 'AGE: 40\n' + s.plan).replace(/5\. Age stamp.*$/m, '5. Age stamp — set_starting_age with his years per root/branch summing to 40 (the GM set AGE 40)');
  const progress = [...JSON.parse(s.progress || '[]'), '[system] GM: "his age should add to 40" — brief AGE corrected 25 → 40; resuming'];
  await prisma.dayaWorkSession.update({ where: { id: ID }, data: { plan, status: 'active', blockedReason: null, progress: JSON.stringify(progress) } });
  console.log('ok');
  process.exit(0);
})();
