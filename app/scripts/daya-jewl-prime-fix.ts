/**
 * Scratch: JEWL's character sheet lives in the Prime Campaign — never in a
 * test campaign. Removes the wrongly-created `__JEWL__` shell (and its
 * persona-harness rows) from The Incubator, then anchors JEWL's DayaEntity
 * to his real Prime sheet. Idempotent.
 *
 * Run: npx tsx scripts/daya-jewl-prime-fix.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { ensureJewlDayaEntity } from '../src/daya/jewl-persona';

async function main() {
  // 1. Remove the wrong Incubator shell.
  const shells = await prisma.character.findMany({
    where: { name: '__JEWL__' },
    select: { id: true, campaignId: true },
  });
  for (const shell of shells) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: shell.id }, select: { id: true } });
    if (entity) {
      await prisma.dayaModelCall.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaMemoryEntry.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaAffect.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaBelievedSheet.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaRelationship.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaEntity.delete({ where: { id: entity.id } });
    }
    await prisma.historyEntry.deleteMany({ where: { subjectId: shell.id } });
    await prisma.character.delete({ where: { id: shell.id } });
    console.log(`- Removed __JEWL__ shell ${shell.id} (campaign ${shell.campaignId})`);
  }

  // 2. Anchor JEWL's DayaEntity to his real Prime sheet.
  const result = await ensureJewlDayaEntity();
  console.log(
    `${result.created ? '+ Created' : '= Found'} JEWL DayaEntity on the Prime sheet — character ${result.characterId}, entity ${result.entityId}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
