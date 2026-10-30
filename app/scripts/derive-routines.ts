/**
 * Derive (or re-derive) a being's routines from its own words and print them.
 *   npx tsx --tsconfig ../tmp/tsconfig.recall.json scripts/derive-routines.ts Violet [Kristopher …]
 *   npx tsx --tsconfig ../tmp/tsconfig.recall.json scripts/derive-routines.ts --show Violet   (print what is stored, no call)
 * One judgment-lane call per being (billable, cents).
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();
import { prisma } from '@/lib/db';

async function main() {
  const args = process.argv.slice(2);
  const show = args.includes('--show');
  const names = args.filter((a) => !a.startsWith('--'));
  if (!names.length) throw new Error('name a character');
  for (const name of names) {
    const ch = await prisma.character.findFirst({ where: { OR: [{ name }, { id: name }] }, select: { id: true, name: true } });
    if (!ch) { console.log(`${name}: not found`); continue; }
    if (!show) {
      const { deriveRoutines } = await import('@/services/routine-derive');
      await deriveRoutines(ch.id);
    }
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: ch.id }, select: { id: true } });
    const rows = entity ? await prisma.dayaRoutine.findMany({ where: { entityId: entity.id }, orderBy: { createdAt: 'asc' } }) : [];
    console.log(`\n== ${ch.name}: ${rows.length} routine(s)`);
    for (const r of rows) {
      console.log(`- [${r.status}] "${r.name}" · triggers ${r.triggers} · cadence ${r.cadence ?? '—'}`);
      for (const e of JSON.parse(r.ends) as Array<Record<string, string>>) console.log(`    ${Object.entries(e).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    }
  }
}
main().finally(() => prisma.$disconnect());
