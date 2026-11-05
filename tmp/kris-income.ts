import { prisma } from '../app/src/lib/db';
import { setIncome } from '../app/src/services/wealth';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const gm = await prisma.user.findUniqueOrThrow({ where: { id: camp.gmUserId! }, select: { id: true, role: true } });
  // VA 50% disability, veteran alone ≈ $1,133/month (2025 schedule) → $13,595/yr.
  console.log(JSON.stringify(await (setIncome as any)(C, gm, { characterId: K, currency: 'USD', amountPerYear: 13595, source: 'VA disability, 50% (monthly check)' })).slice(0, 300));
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
