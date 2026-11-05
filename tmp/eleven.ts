import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const e = await p.dayaEntity.findUnique({ where: { id: 'cmv57ezn2000lds4859pxeux4' } });
  const pp = JSON.parse(e.personaProfile);
  for (const [k, v] of Object.entries(pp)) { const s = JSON.stringify(v); for (const w of ['leven', 'tip', 'five-dollar', 'five dollar', 'bill', 'handoff', 'gave him']) { const i = s.toLowerCase().indexOf(w); if (i >= 0) { console.log('PERSONA', k, w, '…', s.slice(Math.max(0, i - 150), i + 150)); break; } } }
  const facts = await p.worldFact.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', supersededById: null }, select: { subjectKey: true, fact: true } });
  for (const f of facts) if (/eleven|tip|five-dollar|\$5|bill|kristopher/i.test(f.fact)) console.log('FACT', f.subjectKey, '|', f.fact.slice(0, 200));
  const mems = await p.dayaMemoryEntry.findMany({ where: { entityId: e.id, OR: [{ content: { contains: 'leven minutes' } }, { content: { contains: 'gave him' } }, { content: { contains: 'tip' } }] }, select: { id: true, narrativeCycle: true, content: true } });
  for (const m of mems) console.log('MEM', m.id, m.narrativeCycle, m.content.slice(0, 160));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
