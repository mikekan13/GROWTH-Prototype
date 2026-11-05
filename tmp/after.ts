import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any; const t = new Date('2026-10-17T14:45:14Z');
  const ce = await p.canonEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gte: t } }, select: { id: true, kind: true, actorId: true, narration: true, createdAt: true } });
  for (const c of ce) console.log('CANON', c.id, c.kind, c.actorId, c.createdAt.toISOString().slice(11, 19), c.narration.slice(0, 90));
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gte: t } }, select: { id: true, type: true, characterName: true, createdAt: true } });
  for (const e of ev) console.log('EVENT', e.id, e.type, e.characterName, e.createdAt.toISOString().slice(11, 19));
  const mem = await p.dayaMemoryEntry.findMany({ where: { realTime: { gte: t } }, select: { id: true, entityId: true, source: true, content: true } });
  for (const m of mem) console.log('MEM', m.id, m.entityId.slice(-6), m.source, m.content.slice(0, 90).replace(/\n/g, ' '));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
