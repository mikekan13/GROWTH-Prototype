/** HW12 2026-10-31 — the reach judge ruled Violet NOT REACHED on lines that happened in her open doorway, so she holds no memory
 *  of them. Backfill: one memory per missed line, at the line's own cycle, as perception (sight + hearing, face to face). */
import { config } from '../app/node_modules/dotenv'; config({ path: '.env.local' }); config();
import { prisma as p } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const MISSED = ['cmvvvwxov005e5c48to2cfv3o', 'cmvvw66y4009q5c489iw62c2q', 'cmvvwdw5m00bv5c48evp5z3sn', 'cmvvwgf2l00dd5c48225xwfyo', 'cmvvwiv7u00et5c48jk8vq688'];
(async () => {
  const { ingestStimulus } = await import('../app/src/daya/memory');
  const ent = await p.dayaEntity.findUnique({ where: { characterId: VIOLET }, select: { id: true } });
  if (!ent) throw new Error('no entity');
  const rows = await p.campaignEvent.findMany({ where: { id: { in: MISSED }, campaignId: CAMP }, orderBy: { createdAt: 'asc' } });
  for (const r of rows) {
    const pl = JSON.parse(r.payload);
    const content: string = pl.description;
    const have = await p.dayaMemoryEntry.findFirst({ where: { entityId: ent.id, content }, select: { id: true } });
    if (have) { console.log('already', r.id); continue; }
    const res = await ingestStimulus({ entityId: ent.id, cycle: pl.cycle ?? 0, source: 'perception', content, roster: [{ name: 'Kristopher' } as any], extraClassification: { kind: 'table', source: 'perception', backfill: 'hw12-reach-miss', truthRef: r.id, perceivedVia: ['sight', 'hearing'] } });
    console.log(r.createdAt.toISOString().slice(11, 19), res.persisted ? `stored ${res.memoryEntryId}` : 'not stored', '|', content.slice(0, 70));
  }
  await p.$disconnect();
})();
