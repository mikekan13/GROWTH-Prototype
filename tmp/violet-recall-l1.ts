import { prisma } from '../app/src/lib/db';

async function main() {
  const violet = await prisma.character.findFirst({ where: { name: { contains: 'Violet' } }, select: { id: true, name: true } });
  console.log('VIOLET', violet?.id);
  const ev = await prisma.campaignEvent.findFirst({ where: { type: 'being_thought', characterName: { contains: 'Violet' }, createdAt: { gte: new Date('2026-10-25T09:22:00Z') } }, orderBy: { createdAt: 'asc' }, select: { payload: true } });
  const p = JSON.parse(ev!.payload) as Record<string, unknown>;
  console.log('HEARD:', JSON.stringify(p.heard));
  console.log('IMPULSE:', JSON.stringify(p.impulse));
  // Her memories: anything about pizza / order / delivery / knock
  const mems = await prisma.dayaMemoryEntry.findMany({ where: { entity: { characterId: violet!.id } }, select: { id: true, source: true, content: true, realTime: true, salience: true }, orderBy: { realTime: 'asc' } });
  console.log('MEMORIES', mems.length);
  for (const m of mems) {
    const c = m.content.replace(/\s+/g, ' ');
    const hit = /pizza|order|deliver|knock|door|bet|Kristopher/i.test(c);
    console.log(`${hit ? '**' : '  '} ${m.realTime.toISOString().slice(0, 16)} ${m.source} s=${m.salience} ${c.slice(0, 200)}`);
  }
}
main().finally(() => prisma.$disconnect());
