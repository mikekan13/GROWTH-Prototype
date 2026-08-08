/** Scratch: list JEWL characters/entities across campaigns. */
import './_server-only-shim';
import { prisma } from '../src/lib/db';

(async () => {
  const prime = await prisma.campaign.findFirst({ where: { name: '__PRIME__' }, select: { id: true } });
  console.log('prime id:', prime?.id);
  const jewls = await prisma.character.findMany({
    where: { OR: [{ name: { contains: 'JEWL' } }, { name: { contains: 'Jewl' } }] },
    select: { id: true, name: true, campaignId: true, entityType: true },
  });
  for (const j of jewls) {
    const c = j.campaignId ? await prisma.campaign.findUnique({ where: { id: j.campaignId }, select: { name: true } }) : null;
    const de = await prisma.dayaEntity.findUnique({ where: { characterId: j.id }, select: { id: true, status: true } });
    console.log(`char "${j.name}" ${j.id} campaign=${c?.name ?? j.campaignId} type=${j.entityType} dayaEntity=${de ? de.id + '/' + de.status : 'none'}`);
  }
  await prisma.$disconnect();
})();
