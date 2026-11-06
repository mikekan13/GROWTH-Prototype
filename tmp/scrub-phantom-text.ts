/**
 * Remove ONE phantom message from the record (session 6, 2026-11-06): a line SPOKEN across the table that the device layer also sent
 * as a text. Removes: the signal entries carrying those words on both phones, the engine's chime/read declarations for it, the beings'
 * thoughts whose "heard" was that chime/read, and the write-back card/text it provoked. Saves what it deletes to tmp/gm/scrub-phantom-<ts>.json.
 *   node ... ../tmp/scrub-phantom-text.ts "<first words of the phantom message>" ["<first words of the provoked reply>"]
 */
import '../app/scripts/_server-only-shim';
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

async function main() {
  const [phantom, reply] = process.argv.slice(2);
  if (!phantom) throw new Error('usage: scrub-phantom-text.ts "<phantom words>" ["<reply words>"]');
  const needles = [phantom, ...(reply ? [reply] : [])].map((s) => s.toLowerCase());
  const has = (s: string) => needles.some((n) => s.toLowerCase().includes(n));
  const saved: Record<string, unknown[]> = { items: [], events: [], memories: [] };

  // 1. phones: drop signal entries carrying the words
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C, name: { in: ['Her phone', 'Work phone', 'Personal phone'] } }, select: { id: true, name: true, data: true } });
  for (const it of items) {
    const data = JSON.parse(it.data ?? '{}') as Record<string, unknown>;
    let changed = false;
    if (Array.isArray(data.signals)) {
      const before = data.signals.length;
      data.signals = (data.signals as Array<{ words?: string }>).filter((s) => !(s.words && has(s.words)));
      if (data.signals.length !== before) changed = true;
    }
    const sig = data.signal as { words?: string } | undefined;
    if (sig?.words && has(sig.words)) { delete data.signal; changed = true; }
    if (changed) { saved.items.push({ id: it.id, name: it.name, data: it.data }); await prisma.campaignItem.update({ where: { id: it.id }, data: { data: JSON.stringify(data) } }); console.log(`${it.name}: phantom signal removed`); }
  }

  // 2. events since the phantom: device chime/read declarations about it, thoughts that heard it, the provoked write-back card/text
  const since = new Date(Date.now() - 60 * 60_000);
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gte: since } }, select: { id: true, type: true, actor: true, payload: true, createdAt: true } });
  const doomed: string[] = [];
  for (const e of events) {
    let j: Record<string, unknown>; try { j = JSON.parse(e.payload ?? '{}'); } catch { continue; }
    const desc = String(j.description ?? '');
    const heard = String(j.heard ?? '');
    const thought = String(j.thought ?? '');
    const message = String(j.message ?? '');
    const isDevice = j.kind === 'game_event' && j.eventType === 'declaration' && /^(?:\w+'s |\w+ )?(?:phone|work phone|personal phone)\b.*(?:chimes|signals|sounds|receives)|reads the message from/i.test(desc) && has(desc.includes('It says:') ? desc : `${desc} ${phantom}`) && (desc.includes('It says:') ? has(desc) : /text from Kristopher/i.test(desc));
    const heardIt = heard && (has(heard) || (/phone chimes with a text from Kristopher/i.test(heard) && e.createdAt > new Date(Date.now() - 30 * 60_000)));
    const provoked = reply && (thought.includes('types') && has(thought) || (message && has(message)));
    if (isDevice || heardIt || provoked) doomed.push(e.id);
  }
  if (doomed.length) {
    saved.events = events.filter((e) => doomed.includes(e.id));
    await prisma.campaignEvent.deleteMany({ where: { id: { in: doomed } } });
  }
  // 3. memories that carry the phantom words
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true } });
  const entityIds = (await p.dayaEntity.findMany({ where: { characterId: { in: chars.map((c) => c.id) } }, select: { id: true } })).map((e: { id: string }) => e.id);
  const mems = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: entityIds }, realTime: { gte: since } }, select: { id: true, content: true } });
  const memDoomed = mems.filter((m: { content: string }) => /text from Kristopher|It says: You are so/i.test(m.content) || has(m.content) && /text|typed|phone/i.test(m.content)).map((m: { id: string }) => m.id);
  if (memDoomed.length) { saved.memories = mems.filter((m: { id: string }) => memDoomed.includes(m.id)); await p.dayaMemoryEntry.deleteMany({ where: { id: { in: memDoomed } } }); }
  const out = `C:/Projects/GRO.WTH/tmp/gm/scrub-phantom-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify(saved, null, 1));
  console.log(`events removed ${doomed.length}, memories removed ${memDoomed.length}; saved ${out}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
