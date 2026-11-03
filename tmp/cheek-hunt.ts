import { prisma } from '../app/src/lib/db';
(async () => {
  const C = 'cms5z4j6z0000zg48z5vzl2jn', V = 'cms60ndtn0000kw48ioq10i68';
  const phone = await prisma.campaignItem.findFirst({ where: { campaignId: C, name: 'Her phone' }, select: { data: true, story: true } });
  console.log('PHONE data:', phone!.data.slice(0, 600)); console.log('PHONE story:', phone!.story);
  const e = await prisma.dayaEntity.findUnique({ where: { characterId: V }, select: { id: true } });
  const hits = await prisma.dayaMemoryEntry.findMany({ where: { entityId: e!.id, content: { contains: 'cheek' } }, select: { realTime: true, source: true, content: true } });
  console.log('memories with cheek:', hits.length); for (const h of hits) console.log('  ', h.realTime.toISOString().slice(0, 16), h.source, h.content.slice(0, 140));
  const facts = await prisma.worldFact.findMany({ where: { campaignId: C, supersededById: null, fact: { contains: 'cheek' } }, select: { subjectKey: true, fact: true } });
  console.log('facts with cheek:', JSON.stringify(facts));
  const ent = await (prisma as any).dayaEntity.findUnique({ where: { id: e!.id } });
  const blob = JSON.stringify(ent); const i = blob.indexOf('cheek'); console.log('entity blob has cheek at', i, i >= 0 ? blob.slice(Math.max(0, i - 200), i + 100) : '');
  const ch = await prisma.character.findUnique({ where: { id: V }, select: { data: true } }); const j = ch!.data.indexOf('cheek'); console.log('sheet has cheek at', j, j >= 0 ? ch!.data.slice(Math.max(0, j - 200), j + 80) : '');
  process.exit(0);
})();
