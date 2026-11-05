import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
async function main() {
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: C, OR: ['cash', 'twent', 'change', '22.97', 'bills', 'fold'].map((s) => ({ payload: { contains: s } })) }, orderBy: { createdAt: 'asc' }, take: 40, select: { createdAt: true, type: true, actor: true, characterName: true, payload: true } });
  for (const e of ev) console.log(e.createdAt.toISOString(), e.type, e.actor, e.characterName, '|', e.payload.replace(/\s+/g, ' ').slice(0, 420));
  const mem = await prisma.dayaMemoryEntry.findMany({ where: { OR: ['cash', 'twent', 'change', 'bills', 'fold'].map((s) => ({ content: { contains: s } })) }, orderBy: { createdAt: 'asc' }, take: 30, select: { entityId: true, source: true, content: true, createdAt: true } });
  console.log('--- memories'); for (const m of mem) console.log(m.createdAt.toISOString(), m.entityId.slice(-6), m.source, '|', m.content.replace(/\s+/g, ' ').slice(0, 300));
  for (const id of ['cms60ndtn0000kw48ioq10i68', 'cmvcbw49u0001h448qanzbhs3']) {
    const c = await prisma.character.findUnique({ where: { id }, select: { name: true, data: true } });
    const d = JSON.parse(c!.data); console.log('--- wealth of', c!.name, JSON.stringify(d.wealth ?? null));
  }
  const ents = await prisma.dayaEntity.findMany({ where: { campaignId: C }, select: { id: true, characterId: true, name: true } }).catch(() => []);
  console.log('--- entities', JSON.stringify(ents));
}
main().finally(() => prisma.$disconnect());
