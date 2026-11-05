import { prisma } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const p = prisma as any;
  const tables: any[] = await p.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%Log%' OR name LIKE '%Trace%' OR name LIKE '%Run%' OR name LIKE '%Job%' OR name LIKE '%Daya%' OR name LIKE '%Lane%' OR name LIKE '%Error%')`);
  console.log('tables:', tables.map((t) => t.name).join(', '));
  const ents = await p.dayaEntity.findMany({ where: { character: { campaignId: CAMP } }, select: { id: true, status: true, updatedAt: true, dreamPressure: true, character: { select: { name: true } } } });
  for (const e of ents) console.log('entity', e.character.name, e.status, 'updated', String(e.updatedAt).slice(11, 19), 'dream', e.dreamPressure);
  const mems = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: ents.map((e: any) => e.id) }, realTime: { gt: new Date('2026-10-29T11:33:50Z') } }, select: { realTime: true, content: true, entity: { select: { character: { select: { name: true } } } } }, orderBy: { realTime: 'asc' } });
  for (const m of mems) console.log('mem', String(m.realTime).slice(11, 19), m.entity.character.name, '|', m.content.slice(0, 120));
  const camp = await prisma.campaign.findUnique({ where: { id: CAMP }, select: { currentCycle: true, updatedAt: true } });
  console.log('clock', camp?.currentCycle, 'updated', String(camp?.updatedAt).slice(11, 19));
  const hist = await p.historyEntry.findMany({ where: { campaignId: CAMP, realTime: { gt: new Date('2026-10-29T11:33:50Z') } }, select: { realTime: true, summary: true, kind: true } }).catch(() => []);
  for (const h of hist) console.log('history', String(h.realTime).slice(11, 19), h.kind, '|', String(h.summary ?? '').slice(0, 120));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
