/**
 * The Jesus prayer on the rope (HW8 run 5 2026-10-26; Mike HW7: "A prayer in his head is the prayer itself.") — the GM
 * wrote "He says the Jesus prayer in his mind" and the world had no words for it, so the builder's prayer was dropped as
 * invented. This writes the words on the Orthodox prayer rope (data.text = what is written on a thing); the scene builder
 * lets a thought quote what is written on a thing he carries. Idempotent; the rest of the item's data is kept.
 */
import { prisma } from '@/lib/db';

const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const NAME = 'Orthodox prayer rope';
const TEXT = 'Lord Jesus Christ, Son of God, have mercy on me, a sinner.';

async function main() {
  const row = await prisma.campaignItem.findFirst({ where: { campaignId: CAMP, name: NAME, status: 'ACTIVE' } });
  if (!row) { console.error(`no active item named '${NAME}'`); process.exit(1); }
  let data: Record<string, unknown> = {};
  try { data = row.data ? JSON.parse(row.data) : {}; } catch { data = {}; }
  if (data.text !== TEXT) await prisma.campaignItem.update({ where: { id: row.id }, data: { data: JSON.stringify({ ...data, text: TEXT }) } });
  console.log(row.id);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
