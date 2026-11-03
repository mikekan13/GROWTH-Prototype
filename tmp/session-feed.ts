import { prisma } from '../app/src/lib/db';
(async () => {
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gt: new Date('2026-11-02T05:55:00Z') } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, type: true, actor: true, characterName: true, payload: true } });
  for (const e of ev) {
    let p: Record<string, unknown> = {}; try { p = JSON.parse(e.payload); } catch { /* */ }
    const text = String(p.description ?? p.message ?? p.thought ?? p.text ?? '').replace(/\s+/g, ' ');
    console.log(`${e.createdAt.toISOString().slice(11, 19)} ${e.type}/${String(p.kind ?? '')}/${String(p.eventType ?? '')} ${e.characterName ?? e.actor} | ${text.slice(0, 220)}`);
  }
  process.exit(0);
})();
