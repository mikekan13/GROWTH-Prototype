/** Mike 17 Oct: remove the "door is closed" breakdown from the record and run again from his last line.
 *  Rewind to just before 14:45:14: his declaration (event + canon) and everything it produced go to the archive; he re-sends the line. */
import { prisma } from '../app/src/lib/db';
import { writeFileSync } from 'fs';
(async () => {
  const p = prisma as any;
  const ev = await prisma.campaignEvent.findMany({ where: { id: { in: ['cmvcide740087sk48s4n8uc37', 'cmvcidoh3008lsk48sjt1j47l'] } } });
  const canon = await p.canonEvent.findMany({ where: { id: 'cmvcide700086sk484xvbwy4w' } });
  const mems = await p.dayaMemoryEntry.findMany({ where: { id: { in: ['cmvcidha4008dsk48yahrqh75', 'cmvcidhb2008esk48agopsj11'] } } });
  writeFileSync('data/archive/hello-world-rewind-2026-10-17T1445.json', JSON.stringify({ events: ev, canon, memories: mems }, null, 1));
  await p.dayaMemoryEntry.deleteMany({ where: { id: { in: mems.map((m: any) => m.id) } } });
  await p.canonRevision.deleteMany({ where: { canonEventId: { in: canon.map((c: any) => c.id) } } });
  await p.canonEvent.deleteMany({ where: { id: { in: canon.map((c: any) => c.id) } } });
  await prisma.campaignEvent.deleteMany({ where: { id: { in: ev.map(e => e.id) } } });
  console.log('rewound', ev.length, 'events', canon.length, 'canon', mems.length, 'memories');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
