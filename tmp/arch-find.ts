import { prisma } from '../app/src/lib/db';
(async () => {
  const items = await prisma.forgeItem.findMany({ where: { type: 'item', OR: [{ campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, { isGlobal: true }] }, select: { name: true } });
  for (const w of ['wallet','necklace','cross','rope','bracelet','cap','hat','visor','pot','saucepan','hot plate','cooktop','range','polo','button','work shirt','uniform','trousers','khaki','book']) { const hits = items.filter(i => i.name.toLowerCase().includes(w)).map(i => i.name); console.log(w, '→', hits.slice(0, 6).join(' | ')); }
  process.exit(0);
})();
