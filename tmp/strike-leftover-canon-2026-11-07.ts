/** Michael 2026-11-07 "Yes": strike the leftover canon event of the rolled-back 11-06 attempt that still holds the rain voicemail, with anything pointing at it. Snapshot first. */
import '../app/scripts/_server-only-shim';
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const ID = 'cmw4toxcy0007zo48nv5ea44c';
async function main() {
  const ev = await prisma.canonEvent.findUnique({ where: { id: ID } });
  if (!ev) { console.log('already gone'); return; }
  const mems = await prisma.dayaMemoryEntry.findMany({ where: { truthRef: ID } });
  const kids = await prisma.canonEvent.findMany({ where: { parentId: ID } });
  console.log(`canon: ${ev.narration.slice(0, 120)}\nmemories pointing at it: ${mems.length}; child events: ${kids.length}`);
  for (const m of mems) console.log('  mem:', m.content.slice(0, 120));
  if (!process.argv.includes('--apply')) { console.log('(dry run)'); return; }
  writeFileSync(`data/archive/strike-leftover-canon-${Date.now()}.json`, JSON.stringify({ ev, mems, kids }, null, 1));
  if (mems.length) await prisma.dayaMemoryEntry.deleteMany({ where: { id: { in: mems.map((m) => m.id) } } });
  if (kids.length) await prisma.canonEvent.deleteMany({ where: { id: { in: kids.map((k) => k.id) } } });
  await prisma.canonEvent.delete({ where: { id: ID } });
  console.log('struck');
}
main().finally(() => prisma.$disconnect());
