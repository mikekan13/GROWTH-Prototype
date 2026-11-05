import { prisma } from '../app/src/lib/db';
async function main() {
  const m = await prisma.dayaMemoryEntry.findFirst({ where: { content: { contains: 'Kristopher always lingers' } }, select: { content: true, valence: true, arousal: true, salience: true, domains: true } });
  console.log(JSON.stringify(m, null, 1));
}
main().finally(() => prisma.$disconnect());
