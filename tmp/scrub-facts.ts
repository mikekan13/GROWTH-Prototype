/** Remove world facts established at/after a cycle for The Incubator and un-supersede their predecessors.
 *  node --env-file=.env --env-file=.env.local --import tsx ../tmp/scrub-facts.ts <minCycle> */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;
async function main() {
  const min = Number(process.argv[2]);
  if (!Number.isFinite(min)) throw new Error('usage: scrub-facts.ts <minCycle>');
  const gone = await p.worldFact.findMany({ where: { campaignId: C, establishedAtCycle: { gte: min } }, select: { id: true, fact: true } });
  const ids = gone.map((f: { id: string }) => f.id);
  const restored = ids.length ? (await p.worldFact.updateMany({ where: { supersededById: { in: ids } }, data: { supersededById: null } })).count : 0;
  const removed = ids.length ? (await p.worldFact.deleteMany({ where: { id: { in: ids } } })).count : 0;
  console.log(`facts removed ${removed}, predecessors restored ${restored}`);
  for (const f of gone) console.log(' -', String(f.fact).slice(0, 100));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
