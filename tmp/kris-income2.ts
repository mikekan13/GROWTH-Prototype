/** Mike 17 Oct: $13/hr ~40 h/week; tips $50–200 a shift (day vs night); child support takes $800/month from the paychecks. */
import { prisma } from '../app/src/lib/db';
import { setIncome } from '../app/src/services/wealth';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const gm = await prisma.user.findUniqueOrThrow({ where: { id: camp.gmUserId! }, select: { id: true, role: true } });
  const wages = 13 * 40 * 52;           // 27,040
  const support = 800 * 12;              // 9,600 garnished
  const tips = 125 * 5 * 52;             // ~$125 a shift (mid of 50–200), 5 shifts a week → 32,500
  await setIncome(C, gm, { characterId: K, currency: 'USD', amountPerYear: wages - support, source: 'Chess Pizza wages ($13/hr × ~40 h/wk, after $800/mo child support)' });
  const r = await setIncome(C, gm, { characterId: K, currency: 'USD', amountPerYear: tips, source: 'Delivery tips (~$50–200 a shift, day vs night)' });
  console.log(JSON.stringify(r.income.map(i => `${i.source}: $${i.amountPerYear}`)));
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
