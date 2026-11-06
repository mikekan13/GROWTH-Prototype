/** Close the message threads on a set of items: remove every signal (the conversation moved into the room). Saves what it removes.
 *  node ... ../tmp/close-threads.ts <itemId> [<itemId> ...] */
import '../app/scripts/_server-only-shim';
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error('usage: close-threads.ts <itemId> ...');
  const saved: unknown[] = [];
  for (const id of ids) {
    const row = await prisma.campaignItem.findUniqueOrThrow({ where: { id }, select: { name: true, data: true } });
    const data = JSON.parse(row.data ?? '{}') as Record<string, unknown>;
    const n = Array.isArray(data.signals) ? data.signals.length : 0;
    saved.push({ id, name: row.name, signals: data.signals, signal: data.signal });
    delete data.signals; delete data.signal;
    await prisma.campaignItem.update({ where: { id }, data: { data: JSON.stringify(data) } });
    console.log(`${row.name}: ${n} signal(s) closed`);
  }
  const out = `C:/Projects/GRO.WTH/tmp/gm/closed-threads-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify(saved, null, 1));
  console.log('saved', out);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
