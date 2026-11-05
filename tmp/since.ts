import { prisma as p } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const since = process.argv[2] ?? '2026-10-31T04:12:21Z';
(async () => {
  const rows = await p.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gte: new Date(since) } }, orderBy: { createdAt: 'asc' }, select: { type: true, payload: true, createdAt: true } });
  for (const r of rows) {
    const pl = JSON.parse(r.payload);
    const t = r.createdAt.toISOString().slice(11,19);
    if (r.type === 'game_event') console.log(t, 'GM:', pl.description, '| acts:', (pl.actions ?? []).map((a: any) => a.text).join(' / '), '| narr:', pl.narration ?? '');
    else if (r.type === 'being_thought') console.log(t, 'THOUGHT', pl.player ? 'ROUTINE' : '', '| heard:', (pl.heard ?? '').slice(0, 90), '| thought:', (pl.thought ?? '').slice(0, 300), pl.player ? '| player=' + JSON.stringify(pl.player) : '', pl.scene ? '| scene=' + pl.scene : '');
    else console.log(t, r.type, r.payload.slice(0, 400));
  }
  const pizza = await p.campaignItem.findFirst({ where: { name: { startsWith: 'Pizza' } }, select: { holderId: true } });
  console.log('pizza holder', pizza?.holderId === 'cmvcbw49u0001h448qanzbhs3' ? 'Kristopher' : pizza?.holderId === 'cms60ndtn0000kw48ioq10i68' ? 'Violet' : pizza?.holderId);
  await p.$disconnect();
})();
