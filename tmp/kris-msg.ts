import { prisma } from '../app/src/lib/db';
(async () => {
  const m = await (prisma as any).copilotMessage.findFirst({ where: { content: { startsWith: 'Kristopher needs Items' } }, orderBy: { createdAt: 'desc' } });
  console.log(m.content);
  const words = ['polo','visor','cargo','pants','belt','sneaker','shoe','boot','sock','boxer','brief','underwear','duffel','skillet','range','stove','burner','pot','phone','smartphone','computer','desktop','monitor','car','sedan','vehicle','hybrid','book','t-shirt','shirt','jeans','hoodie','jacket'];
  const items = await prisma.forgeItem.findMany({ where: { type: 'item', OR: [{ campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, { isGlobal: true }] }, select: { name: true, campaignId: true, status: true } });
  console.log('archetypes', items.length);
  for (const w of words) { const hits = items.filter(i => i.name.toLowerCase().includes(w)).map(i => i.name); if (hits.length) console.log(w, '→', hits.slice(0, 8).join(' | ')); }
  process.exit(0);
})();
