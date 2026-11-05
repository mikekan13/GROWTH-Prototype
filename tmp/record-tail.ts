import { prisma as p } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const sess = await p.gameSession.findFirst({ where: { campaignId: CAMP, endedAt: null }, select: { id: true, startedAt: true, number: true } });
  console.log('session', sess);
  const rows = await p.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gte: sess?.startedAt ?? new Date(0) } }, orderBy: { createdAt: 'asc' }, select: { type: true, payload: true, createdAt: true } });
  for (const r of rows) {
    let pl: any = {}; try { pl = JSON.parse(r.payload); } catch { pl = { raw: r.payload }; }
    const txt = pl.text ?? pl.content ?? pl.sentence ?? pl.message ?? pl.scene ?? '';
    const who = pl.characterName ?? pl.actorName ?? pl.name ?? pl.characterId ?? '';
    const segs = Array.isArray(pl.segments) ? pl.segments.map((s: any) => `[${s.kind}] ${s.text}`).join(' | ') : '';
    const player = pl.player ? ` PLAYER=${JSON.stringify(pl.player)}` : '';
    console.log(`${r.createdAt.toISOString().slice(11,19)} ${r.type} ${who} :: ${String(txt).slice(0,220)} ${segs.slice(0,400)}${player}`);
  }
  const kr = await p.dayaRoutine.findMany({ select: { name: true, triggers: true, status: true, cursor: true, entity: { select: { character: { select: { name: true } } } } } });
  for (const r of kr) console.log('routine', r.entity.character?.name, r.name, r.status, r.cursor, r.triggers);
  await p.$disconnect();
})();
