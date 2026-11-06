/**
 * RE-TIME (the Watcher's correction, by hand until it is built): shift everything The Incubator recorded since `from`
 * by `deltaYears` of world time — event cycles, memory cycles, history cycles — so the beats read at the right hour
 * without re-living the hours. Does NOT touch the campaign clock (set it through the clock route afterwards).
 *   node --env-file=.env --env-file=.env.local --import tsx ../tmp/retime.ts <fromISO> <deltaYears>
 */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;
async function main() {
  const from = new Date(process.argv[2]); const delta = Number(process.argv[3]);
  if (Number.isNaN(from.getTime()) || !Number.isFinite(delta)) throw new Error('usage: retime.ts <fromISO> <deltaYears>');
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gte: from } }, select: { id: true, payload: true } });
  let ev = 0;
  for (const e of events) {
    let j: Record<string, unknown>; try { j = JSON.parse(e.payload ?? '{}'); } catch { continue; }
    if (typeof j.cycle === 'number') { j.cycle = (j.cycle as number) + delta; await prisma.campaignEvent.update({ where: { id: e.id }, data: { payload: JSON.stringify(j) } }); ev++; }
  }
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true } });
  const entityIds = (await p.dayaEntity.findMany({ where: { characterId: { in: chars.map((c) => c.id) } }, select: { id: true } })).map((e: { id: string }) => e.id);
  const mems = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: entityIds }, realTime: { gte: from } }, select: { id: true, narrativeCycle: true } });
  for (const m of mems) await p.dayaMemoryEntry.update({ where: { id: m.id }, data: { narrativeCycle: m.narrativeCycle + delta } });
  let hist = 0;
  try {
    const rows = await p.historyEntry.findMany({ where: { campaignId: C, realTime: { gte: from } }, select: { id: true, cycle: true } });
    for (const h of rows) { await p.historyEntry.update({ where: { id: h.id }, data: { cycle: h.cycle + delta } }); hist++; }
  } catch { /* no cycle column */ }
  console.log(`retimed: ${ev} events, ${mems.length} memories, ${hist} history rows by ${delta} years (${(delta * 365 * 24 * 60).toFixed(0)} min)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
