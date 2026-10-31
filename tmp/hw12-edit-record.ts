/** HW12 2026-10-31 — Michael: "We are keeping this one but you need to edit it for all the mistakes."
 *  Archives every touched row first (app/data/archive/hw12-record-edit-<ts>.json), then: deletes the roll the sim raised on
 *  the Watcher's own line, the empty thought card, and the duplicate "waits, hands ready" card; mends the speech-to-text
 *  and typing slips and the engine's clunky give lines. Usage: npx tsx --tsconfig ../tmp/tsconfig.recall.json ../tmp/hw12-edit-record.ts [--dry] */
import { prisma as p } from '../app/src/lib/db';
import { writeFileSync, mkdirSync } from 'fs';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const DRY = process.argv.includes('--dry');
const DELETE = ['cmvvvxebx006g5c48zg4258u4', 'cmvvwe7xo00cm5c4812bzzttb', 'cmvvvx977006b5c48d40pd40g'];
const FIX: Array<[string, string]> = [
  ['He slowly hands. Her the box and tries to read off the price but he is obviously taken by her beauty.', 'He slowly hands her the box and tries to read off the price, but he is obviously taken by her beauty.'],
  ['recipt', 'receipt'], ['reaad', 'read'], ['outloud', 'out loud'],
  ['The cash in her wallet passes to Kristopher.', 'The cash passes to Kristopher.'],
  ['Violet hands the cash in her wallet to Kristopher.', 'Violet hands Kristopher the cash.'],
  ['The Five-dollar bill with her number passes to Kristopher.', 'The five-dollar bill with her number passes to Kristopher.'],
  ['Violet hands the Five-dollar bill with her number to Kristopher.', 'Violet hands Kristopher the five-dollar bill with her number.'],
];
(async () => {
  const rows = await p.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gte: new Date('2026-10-31T04:00:46Z') } }, orderBy: { createdAt: 'asc' } });
  const touched: typeof rows = [];
  const updates: Array<{ id: string; payload: string }> = [];
  for (const r of rows) {
    if (DELETE.includes(r.id)) { touched.push(r); continue; }
    let s = r.payload;
    for (const [a, b] of FIX) s = s.split(a).join(b);
    if (s !== r.payload) { touched.push(r); updates.push({ id: r.id, payload: s }); }
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync('data/archive', { recursive: true });
  writeFileSync(`data/archive/hw12-record-edit-${ts}${DRY ? '-dry' : ''}.json`, JSON.stringify({ deleted: DELETE, touched }, null, 1));
  console.log(`archive: ${touched.length} rows (${DELETE.length} to delete, ${updates.length} to mend)${DRY ? ' — DRY' : ''}`);
  if (DRY) { await p.$disconnect(); return; }
  await p.$transaction([
    p.campaignEvent.deleteMany({ where: { id: { in: DELETE }, campaignId: CAMP } }),
    ...updates.map((u) => p.campaignEvent.update({ where: { id: u.id }, data: { payload: u.payload } })),
  ]);
  console.log('done');
  await p.$disconnect();
})();
