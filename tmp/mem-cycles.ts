import { prisma } from '../app/src/lib/db';
async function main() {
  const ms = await prisma.dayaMemoryEntry.findMany({ where: { OR: [{ content: { contains: 'Kristopher always lingers' } }, { content: { contains: 'same pizza place' } }, { content: { contains: 'lock the door every time' } }] }, select: { id: true, narrativeCycle: true, content: true } });
  for (const m of ms) console.log(m.id, m.narrativeCycle, m.content.slice(0, 40));
}
main().finally(() => prisma.$disconnect());
