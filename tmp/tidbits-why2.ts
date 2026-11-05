import { prisma } from '../app/src/lib/db';
(async () => {
  for (const needle of ['the one I always reach for', 'the drawers stick in summer', 'most expensive single thing']) {
    const ms = await (prisma as any).dayaMemoryEntry.findMany({ where: { content: { contains: needle } }, select: { content: true, source: true, salience: true, visibleForm: true }, take: 2 });
    for (const m of ms) console.log(JSON.stringify(m.content.slice(0, 160)), m.source, m.salience, "visible:", JSON.stringify((m.visibleForm ?? "").slice(0,80)));
    const its = await (prisma as any).campaignItem.findMany({ where: { OR: [{ story: { contains: needle } }, { history: { contains: needle } }] }, select: { name: true, story: true, history: true } });
    for (const i of its) console.log('ITEM', i.name, '| story:', (i.story ?? '').slice(0, 100), '| history:', (i.history ?? '').slice(0, 200));
    console.log('--');
  }
  process.exit(0);
})();
