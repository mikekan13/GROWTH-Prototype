import { prisma } from '../app/src/lib/db';
(async () => {
  const links = await prisma.characterBlockLink.findMany({ where: { characterId: 'cmvcbw49u0001h448qanzbhs3' } }) as any[];
  for (const l of links) {
    const b = await (prisma as any).forgeItem.findUnique({ where: { id: l.forgeItemId } });
    if (b && ['root', 'branch'].includes(b.type)) console.log(b.type, '|', b.name, '|', l.localName ?? '', '| years', l.ageAdded, '| archetype', JSON.parse(b.data).ageAdded, '| link', l.id);
  }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
