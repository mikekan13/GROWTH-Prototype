import { prisma } from '../app/src/lib/db';
async function main() {
  const ch = await prisma.character.findFirst({ where: { name: { contains: 'Violet' } }, select: { id: true } });
  const goals = await prisma.goal.findMany({ where: { characterId: ch!.id }, select: { status: true, priority: true, description: true } });
  for (const g of goals) console.log(g.status, g.priority, g.description.replace(/\s+/g, ' ').slice(0, 160));
  const mems = await prisma.dayaMemoryEntry.findMany({ where: { entity: { characterId: ch!.id }, content: { contains: 'pizza' } }, select: { content: true, valence: true, arousal: true, salience: true, domains: true, narrativeCycle: true } });
  for (const m of mems) console.log('\nPIZZA MEM v=', m.valence, 'a=', m.arousal, 's=', m.salience, 'dom=', m.domains, 'cyc=', m.narrativeCycle, '\n', m.content);
}
main().finally(() => prisma.$disconnect());
