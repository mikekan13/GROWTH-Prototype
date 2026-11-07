/**
 * 2026-11-07: move every message entry still stored on a thing's own data (data.signals / data.signal, kind text or state
 * received/read) into WorldMessage, then strip them from the thing. Snapshots every touched item first.
 * Usage (from app/): npx tsx ../tmp/migrate-messages-to-record.ts [--apply]
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const apply = process.argv.includes('--apply');
async function main() {
  const items = await prisma.campaignItem.findMany({ where: { data: { contains: '"signal' } }, select: { id: true, campaignId: true, name: true, holderId: true, data: true } });
  const touched: typeof items = [];
  let moved = 0;
  for (const it of items) {
    let d: Record<string, unknown>; try { d = JSON.parse(it.data); } catch { continue; }
    const raw: Array<Record<string, unknown>> = Array.isArray(d.signals) ? d.signals as never : d.signal ? [d.signal as never] : [];
    const msgs = raw.filter((x) => x && (x.kind === 'text' || x.state === 'received' || x.state === 'read'));
    if (!msgs.length) continue;
    touched.push(it);
    for (const m of msgs) {
      const since = typeof m.since === 'number' ? m.since : 0;
      console.log(`${it.name} (${it.holderId}): ${m.state} from ${m.by ?? '?'} at ${since}: "${String(m.words ?? '').slice(0, 60)}"`);
      if (!apply || !it.holderId) continue;
      await prisma.worldMessage.create({ data: {
        campaignId: it.campaignId, medium: 'text', senderId: (m.by as string) ?? null, senderThingId: (m.fromItem as string) ?? null,
        recipientId: it.holderId, recipientThingId: it.id, content: String(m.words ?? ''), notice: String(m.text ?? ''),
        sentCycle: since, deliveredCycle: since, readCycle: m.state === 'read' ? since : null, noticedCycle: m.state === 'read' ? since : null,
        data: JSON.stringify({ migratedFrom: 'item-data', note: m.state === 'read' ? 'read time unknown (stored as delivery time)' : undefined }),
      } });
      moved++;
    }
    if (apply) {
      const rest = raw.filter((x) => !msgs.includes(x));
      delete d.signal; if (rest.length) { d.signals = rest; d.signal = rest[rest.length - 1]; } else delete d.signals;
      await prisma.campaignItem.update({ where: { id: it.id }, data: { data: JSON.stringify(d) } });
    }
  }
  if (apply && touched.length) writeFileSync(`data/archive/migrate-messages-${Date.now()}.json`, JSON.stringify(touched, null, 1));
  console.log(`${touched.length} thing(s) with messages; ${apply ? `${moved} moved` : 'dry run'}`);
}
main().finally(() => prisma.$disconnect());
