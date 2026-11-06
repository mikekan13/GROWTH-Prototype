/** Remove the phone-chime beats since a time: the world's chime/read declarations, the thoughts that heard a chime, the memories of it,
 *  and the phones' signal entries since then. Keeps the Watcher's lines and every thought that heard spoken words. Saves what it removes.
 *  node ... ../tmp/scrub-chime-since.ts <fromISO> */
import '../app/scripts/_server-only-shim';
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;
const CHIME = /phone (?:chimes|signals|sounds|receives|registers)|reads the message from|someone's phone chimes/i;
async function main() {
  const from = new Date(process.argv[2]);
  if (Number.isNaN(from.getTime())) throw new Error('usage: scrub-chime-since.ts <fromISO>');
  const fromCycle = (await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true } })).currentCycle - 0.00002;
  const saved: Record<string, unknown[]> = { events: [], memories: [], items: [] };
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gte: from } } });
  const doomed = events.filter((e) => {
    let j: Record<string, unknown>; try { j = JSON.parse(e.payload ?? '{}'); } catch { return false; }
    if (j.kind === 'game_event' && j.eventType === 'declaration' && (j.via === 'device' || e.actorName === 'the world') && CHIME.test(String(j.description ?? ''))) return true;
    if (j.kind === 'being_thought' && CHIME.test(String(j.heard ?? '')) && !/\n\w+: /.test(String(j.heard ?? ''))) return true;
    return false;
  });
  saved.events = doomed;
  if (doomed.length) await prisma.campaignEvent.deleteMany({ where: { id: { in: doomed.map((e) => e.id) } } });
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true } });
  const entityIds = (await p.dayaEntity.findMany({ where: { characterId: { in: chars.map((c) => c.id) } }, select: { id: true } })).map((e: { id: string }) => e.id);
  const mems = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: entityIds }, realTime: { gte: from } }, select: { id: true, content: true } });
  const memDoomed = mems.filter((m: { content: string }) => CHIME.test(m.content) || /\b(?:text message|the chime|my message landing)\b/i.test(m.content));
  saved.memories = memDoomed;
  if (memDoomed.length) await p.dayaMemoryEntry.deleteMany({ where: { id: { in: memDoomed.map((m: { id: string }) => m.id) } } });
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C, name: { in: ['Her phone', 'Work phone', 'Personal phone'] } }, select: { id: true, name: true, data: true } });
  for (const it of items) {
    const data = JSON.parse(it.data ?? '{}') as Record<string, unknown>;
    const sigs = Array.isArray(data.signals) ? (data.signals as Array<{ since?: number }>) : [];
    const keep = sigs.filter((s) => (s.since ?? 0) < fromCycle);
    const sig = data.signal as { since?: number } | undefined;
    if (keep.length !== sigs.length || (sig && (sig.since ?? 0) >= fromCycle)) {
      saved.items.push({ id: it.id, name: it.name, data: it.data });
      if (keep.length) data.signals = keep; else delete data.signals;
      if (sig && (sig.since ?? 0) >= fromCycle) delete data.signal;
      await prisma.campaignItem.update({ where: { id: it.id }, data: { data: JSON.stringify(data) } });
      console.log(`${it.name}: ${sigs.length - keep.length} signal(s) removed`);
    }
  }
  const out = `C:/Projects/GRO.WTH/tmp/gm/scrub-chime-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify(saved, null, 1));
  console.log(`events removed ${doomed.length}, memories removed ${memDoomed.length}; saved ${out}`);
  for (const e of doomed) { let j: Record<string, unknown> = {}; try { j = JSON.parse(e.payload ?? '{}'); } catch { /* */ } console.log(' -', e.createdAt.toISOString().slice(11, 19), e.type, String(j.description ?? j.heard ?? '').slice(0, 80)); }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
