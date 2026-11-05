import { prisma as p } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const rows = await p.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gte: new Date('2026-10-31T04:00:46Z') } }, orderBy: { createdAt: 'asc' }, select: { id: true, type: true, payload: true, createdAt: true } });
  for (const r of rows) {
    const pl = JSON.parse(r.payload); const t = r.createdAt.toISOString().slice(11,19);
    let s = '';
    if (r.type === 'game_event') s = `GM ${pl.eventType}: ${pl.description ?? ''}`;
    else if (r.type === 'being_thought') s = `${pl.characterName ?? pl.characterId ?? '?'} THOUGHT${pl.player ? '(routine)' : ''}: ${pl.thought ?? ''}`;
    else if (r.type === 'chat') s = `CHAT ${pl.via}: ${pl.message}`;
    else s = `${r.type}: ${r.payload.slice(0, 200)}`;
    console.log(`${t} ${r.id} ${r.type} | ${s.replace(/\s+/g, ' ').slice(0, 170)}`);
  }
  await p.$disconnect();
})();
