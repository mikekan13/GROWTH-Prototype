import { prisma } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const p = prisma as any;
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: CAMP }, orderBy: { id: 'desc' }, take: 6 });
  for (const e of ev.reverse()) { const pl = JSON.parse(e.payload ?? '{}'); console.log('EV', e.createdAt.toISOString().slice(11, 19), e.type, e.characterName ?? '', (pl.heard ?? pl.description ?? '').slice(0, 90), '| thought:', (pl.thought ?? '').slice(0, 80)); }
  const canon = await p.canonEvent.findMany({ where: { campaignId: CAMP }, orderBy: { id: 'desc' }, take: 4, select: { createdAt: true, narration: true } });
  for (const c of canon.reverse()) console.log('CANON', String(c.createdAt).slice(11, 19), c.narration.slice(0, 120));
  const mems = await p.dayaMemoryEntry.findMany({ where: { entity: { character: { campaignId: CAMP } }, realTime: { gt: new Date('2026-10-29T11:33:30Z') } }, select: { realTime: true, content: true, source: true, entity: { select: { character: { select: { name: true } } } } }, orderBy: { realTime: 'asc' } });
  for (const m of mems) console.log('MEM', new Date(m.realTime).toISOString().slice(11, 19), m.entity.character.name, m.source, '|', m.content.replace(/\s+/g, ' ').slice(0, 160));
  const logs: any[] = await p.$queryRawUnsafe(`SELECT * FROM ChangeLog WHERE campaignId = ? ORDER BY rowid DESC LIMIT 5`, CAMP).catch(() => []);
  for (const l of logs) console.log('CHANGELOG', JSON.stringify(l).slice(0, 200));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
