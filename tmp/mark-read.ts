/** Mark every received (unread) signal on an item as read at the current clock (the Watcher's correction: she is in the room; the texts are old news).
 *  node ... ../tmp/mark-read.ts <itemId> */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
async function main() {
  const [itemId] = process.argv.slice(2);
  if (!itemId) throw new Error('usage: mark-read.ts <itemId>');
  const row = await prisma.campaignItem.findUniqueOrThrow({ where: { id: itemId }, select: { name: true, data: true } });
  const cycle = (await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true } })).currentCycle;
  const data = JSON.parse(row.data ?? '{}') as Record<string, unknown>;
  let n = 0;
  const fix = (s: Record<string, unknown>) => { if (s && s.state === 'received') { s.state = 'read'; if (s.until == null) s.until = cycle; n++; } };
  if (Array.isArray(data.signals)) for (const s of data.signals as Record<string, unknown>[]) fix(s);
  if (data.signal && typeof data.signal === 'object') fix(data.signal as Record<string, unknown>);
  await prisma.campaignItem.update({ where: { id: itemId }, data: { data: JSON.stringify(data) } });
  console.log(`${row.name}: ${n} signal(s) marked read at cycle ${cycle}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
