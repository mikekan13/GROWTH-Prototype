import { prisma } from '@/lib/db';
prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } }).then(async c => {
  const k = await prisma.character.findFirst({ where: { campaignId: c!.id, name: 'Kristopher' }, select: { id: true } });
  const v = await prisma.character.findFirst({ where: { campaignId: c!.id, name: 'Violet' }, select: { id: true } });
  console.log('IDS', c!.id, k!.id, v!.id); process.exit(0);
});
