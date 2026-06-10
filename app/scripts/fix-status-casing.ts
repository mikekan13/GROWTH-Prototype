// One-time data repair: Character.status was written lowercase ('active') by
// the godhead seed scripts while the entire codebase gates on uppercase
// lifecycle values (DRAFT/SUBMITTED/APPROVED/ACTIVE/GHOST/RETIRED).
// Uppercases any lowercase status values in place. Idempotent.
import { prisma } from '../src/lib/db';

async function main() {
  const chars = await prisma.character.findMany({ select: { id: true, name: true, status: true } });
  let fixed = 0;
  for (const c of chars) {
    const upper = c.status.toUpperCase();
    if (upper !== c.status) {
      await prisma.character.update({ where: { id: c.id }, data: { status: upper } });
      console.log(`fixed: ${c.name} '${c.status}' -> '${upper}'`);
      fixed++;
    }
  }
  console.log(`done — ${fixed} of ${chars.length} characters repaired`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
