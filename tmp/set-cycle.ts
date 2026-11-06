/** Set The Incubator's clock. node --env-file=.env --env-file=.env.local --import tsx ../tmp/set-cycle.ts <cycle> */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
async function main() {
  const cycle = Number(process.argv[2]);
  if (!Number.isFinite(cycle)) throw new Error('usage: set-cycle.ts <cycle>');
  const before = (await prisma.campaign.findUniqueOrThrow({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { currentCycle: true } })).currentCycle;
  await prisma.campaign.update({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, data: { currentCycle: cycle } });
  console.log(`clock ${before} -> ${cycle}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
