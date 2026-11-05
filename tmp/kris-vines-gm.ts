/** Mike 2026-10-17: "I will create his gro.vines so JEWL doesn't need that". Close the open VINES prod and let the session go on. */
import { prisma } from '../app/src/lib/db';
const SID = 'cmvccda300001yc48xnp1f8vx';
(async () => {
  const p = prisma as any;
  const s = await prisma.dayaWorkSession.findUniqueOrThrow({ where: { id: SID } });
  const gm = (await prisma.campaign.findUniqueOrThrow({ where: { id: s.campaignId }, select: { gmUserId: true } })).gmUserId;
  const open = await p.genesisProd.findMany({ where: { sessionId: SID, status: 'OPEN' } });
  for (const pr of open) await p.genesisProd.update({ where: { id: pr.id }, data: { status: 'ANSWERED', answer: 'The GM is writing his GRO.vines himself. Do not write or propose any goals — the VINES stage completes when the GM has filled his slots.', decidedById: gm, decidedAt: new Date() } });
  const plan = s.plan.includes('GM WRITES HIS GRO.VINES') ? s.plan : s.plan + '\n\nGM WRITES HIS GRO.VINES (17 Oct): do not write, propose or ask about goals. The VINES stage completes when the GM has filled his slots.';
  await prisma.dayaWorkSession.update({ where: { id: SID }, data: { status: 'active', blockedReason: null, prodRound: 0, plan, progress: JSON.stringify([...JSON.parse(s.progress), '[prods] GM: he writes the GRO.vines himself — resuming']) } });
  console.log('closed', open.length);
  process.exit(0);
})();
