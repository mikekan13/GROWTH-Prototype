import { prisma } from '../app/src/lib/db';
const K = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const p = prisma as any;
  const ent = await p.dayaEntity.findFirst({ where: { characterId: K } });
  const mems = ent ? await p.dayaMemoryEntry.count({ where: { entityId: ent.id } }) : 0;
  const facts = await p.worldFact.count({ where: { OR: [{ subjectId: K }, { content: { contains: 'Kristopher' } }] } }).catch((e: any) => 'err ' + e.message.slice(0, 80));
  const links = await prisma.characterBlockLink.count({ where: { characterId: K } });
  console.log('daya', !!ent, 'memories', mems, 'facts', facts, 'blockLinks', links);
  process.exit(0);
})();
