import { prisma } from '../app/src/lib/db';
import { supersede } from '../app/src/daya/world-ledger';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const p = prisma as any;
  const cycle = (await prisma.campaign.findUnique({ where: { id: CAMP }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  const facts = await p.worldFact.findMany({ where: { campaignId: CAMP, supersededById: null }, select: { id: true, subjectKey: true, fact: true } });
  let n = 0;
  for (const f of facts) {
    const last = f.subjectKey.split('.').pop();
    if (last === 'rust_blanket' && f.fact.startsWith('The green couch stands')) {
      const rest = f.fact.replace(/^The green couch stands[^.]*\.\s*/, '');
      await supersede(f.id, { fact: rest, cycle }); n++;
      console.log('repaired', f.subjectKey, '→', rest);
    }
  }
  console.log('repaired', n);
  process.exit(0);
})();
