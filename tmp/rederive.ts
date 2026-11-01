/**
 * Re-read a character's routines from their words and the world's facts, outside the app (the engine derives).
 * Run: cd app && npx tsx --require ../tmp/stub-server-only.cjs ../tmp/rederive.ts "Kristopher"
 */
import { prisma } from '../app/src/lib/db';
import { deriveRoutines } from '../app/src/services/routine-derive';
import { endsInWords } from '../app/src/daya/routines';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const ref = process.argv[2] ?? 'Kristopher';
  const c = await prisma.character.findFirst({ where: { campaignId: C, name: { startsWith: ref } }, select: { id: true, name: true } });
  if (!c) throw new Error(`no ${ref}`);
  const drafts = await deriveRoutines(c.id);
  for (const d of drafts) console.log(`• ${d.name} [${d.cadence ?? '-'}] triggers: ${d.triggers.join(', ')}\n    ${endsInWords(d.ends).join(' → ')}`);
  process.exit(0);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
