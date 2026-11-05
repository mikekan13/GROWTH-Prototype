/**
 * Read every being's existing memories for intentions (one-off after the layer landed, 2026-10-25) and show
 * what is due on the knock. Run from app/: npx tsx --tsconfig ../tmp/tsconfig.recall.json ../tmp/seed-intentions.ts
 */
import { prisma } from '@/lib/db';
import { noteIntentions, dueIntentionsFor } from '@/daya/intentions';

const CUE = 'He wipes his eyes from the tears he was crying in the car. He knocks on the door.';

async function main() {
  const entities = await prisma.dayaEntity.findMany({ select: { id: true, character: { select: { name: true } } } });
  const camp = await prisma.campaign.findFirst({ select: { currentCycle: true } });
  const now = camp?.currentCycle ?? 0;
  if (process.argv.includes('--reset')) console.log('reset: removed', (await prisma.dayaIntention.deleteMany({})).count, 'rows');
  for (const e of entities) {
    const mems = await prisma.dayaMemoryEntry.findMany({ where: { entityId: e.id, NOT: { source: 'dream' } }, select: { id: true, content: true, narrativeCycle: true } });
    let made = 0;
    for (const m of mems) made += await noteIntentions(e.id, m.id, m.content, m.narrativeCycle);
    const rows = await prisma.dayaIntention.findMany({ where: { entityId: e.id }, orderBy: { narrativeCycle: 'asc' } });
    console.log(`\n== ${e.character.name}: ${mems.length} memories → ${made} new intentions (${rows.length} total)`);
    for (const r of rows) console.log(`  [${r.status}] ${r.cadence ? `every:${r.cadence} ` : ''}${r.trigger ? `when:"${r.trigger}" ` : ''}${r.dueCycle !== null ? `due:${r.dueCycle.toFixed(5)}–${r.dueUntil?.toFixed(5)} ` : ''}${r.goalId ? 'vine ' : ''}:: ${r.description.slice(0, 110)}`);
    const due = await dueIntentionsFor(e.id, CUE, now);
    console.log(`  DUE on the knock at cycle ${now.toFixed(5)}: ${due.length}`);
    for (const d of due) console.log(`    (${d.why}) ${d.description}`);
  }
}
main().finally(() => prisma.$disconnect());
