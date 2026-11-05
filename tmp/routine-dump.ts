import { prisma } from '../app/src/lib/db';
async function main() {
  const rs = await prisma.dayaRoutine.findMany({ where: { status: { not: 'RETIRED' } }, select: { id: true, entityId: true, name: true, triggers: true, cadence: true, ends: true, status: true, lastDoneCycle: true, sourceIntentionIds: true } });
  for (const r of rs) console.log(JSON.stringify(r));
  const ents = await prisma.dayaEntity.findMany({ select: { id: true, characterId: true, name: true } }).catch(() => []);
  console.log('entities', JSON.stringify(ents));
}
main().finally(() => prisma.$disconnect());
