/** Michael 2026-11-02: "Fix her memories." Violet's memories from the faulty first stretch run (11-01 00:46–00:56 UTC,
 *  cycles 0.00225–0.00773) are hollow or wrong: a dark phone pressed to her cheek, "silence has grown teeth", an engine
 *  idling (Kristopher's car leaking in), waiting for a knock. Archived and removed; the two days are blank rather than false. */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
(async () => {
  const e = await prisma.dayaEntity.findUnique({ where: { characterId: 'cms60ndtn0000kw48ioq10i68' }, select: { id: true } });
  const where = { entityId: e!.id, realTime: { gte: new Date('2026-11-01T00:46:00Z'), lt: new Date('2026-11-01T00:57:00Z') } };
  const rows = await prisma.dayaMemoryEntry.findMany({ where });
  writeFileSync(`data/archive/violet-stretch-memories-${Date.now()}.json`, JSON.stringify(rows, null, 1));
  const r = await prisma.dayaMemoryEntry.deleteMany({ where });
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', characterName: 'Violet', createdAt: { gte: new Date('2026-11-01T00:46:00Z'), lt: new Date('2026-11-01T00:57:00Z') } } });
  writeFileSync(`data/archive/violet-stretch-events-${Date.now()}.json`, JSON.stringify(ev, null, 1));
  const r2 = await prisma.campaignEvent.deleteMany({ where: { id: { in: ev.map((x) => x.id) } } });
  console.log(`Violet: ${r.count} stretch memories and ${r2.count} stretch events archived and removed`);
  process.exit(0);
})();
