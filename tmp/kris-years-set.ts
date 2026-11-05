/** Mike 2026-10-17: root 19; active duty 30 Jul 2012 → 29 May 2021; aftermath 1; a turbulent branch (Miami, back to TN, first marriage, two children) goes between root and service. */
import { prisma } from '../app/src/lib/db';
const set: Record<string, number> = { cmvccrm1o002tyc48wxt0ef4l: 9, cmvccrzsj002vyc48z7ecqhoy: 4, cmvccse0m002xyc48tbcffhnt: 1 };
const SID = 'cmvccda300001yc48xnp1f8vx';
(async () => {
  for (const [id, y] of Object.entries(set)) await prisma.characterBlockLink.update({ where: { id }, data: { ageAdded: y } });
  const s = await prisma.dayaWorkSession.findUniqueOrThrow({ where: { id: SID } });
  const ruling = [
    'GM RULING (17 Oct) — his timeline (born ~Oct 1986, 40 now):',
    '- Divided Household Childhood (root) 19 → ~Oct 2005.',
    '- NEW BRANCH, 7 years (~Oct 2005 → Jul 2012): turbulent — moves to Miami, moves back to Tennessee, first marriage, two children. Draft it in the Forge (propose_forge_blueprint), attach it once published.',
    '- Enlisted Service — Communications: 9 (active duty 30 Jul 2012 → 29 May 2021). SET.',
    '- Primary Caregiver Years: 4 (May 2021 → ~Oct 2025). SET.',
    '- Year of Aftermath: 1 (~Oct 2025 → now). SET.',
    'After the branch is attached: set_starting_age (sum 40), then re-date any memory whose atAge no longer fits (the marriage and children are BEFORE the service, not after).',
  ].join('\n');
  if (!s.plan.includes('GM RULING (17 Oct)')) await prisma.dayaWorkSession.update({ where: { id: SID }, data: { plan: s.plan + '\n\n' + ruling, progress: JSON.stringify([...JSON.parse(s.progress), '[system] GM ruling: timeline rebalanced (9/4/1 set); new 7-year turbulent branch to draft']) } });
  console.log('ok', s.status, s.stage);
  process.exit(0);
})();
