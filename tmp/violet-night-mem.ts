import { prisma } from '../app/src/lib/db';
async function main() {
  const ms = await prisma.dayaMemoryEntry.findMany({ where: { OR: [{ content: { contains: 'night I do not remember' } }, { content: { contains: 'Rosemary died' } }, { content: { contains: 'lock the door every time' } }, { content: { contains: 'Derek came by' } }] }, select: { content: true, valence: true, arousal: true, salience: true, domains: true } });
  for (const m of ms) console.log(`v=${m.valence} a=${m.arousal} s=${m.salience.toFixed(2)} dom=${m.domains} :: ${m.content.replace(/\s+/g, ' ').slice(0, 110)}`);
}
main().finally(() => prisma.$disconnect());
