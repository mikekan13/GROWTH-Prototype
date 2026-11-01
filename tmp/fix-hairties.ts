import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
async function main() {
  const dish = await prisma.campaignItem.findFirst({ where: { campaignId: C, name: 'The hair tie dish' } });
  const d = JSON.parse(dish!.data); d.parts = [{ ...d.parts[0], name: 'hair tie' }];
  await prisma.campaignItem.update({ where: { id: dish!.id }, data: { data: JSON.stringify(d) } });
  const arch = await prisma.forgeItem.findUnique({ where: { id: dish!.sourceForgeItemId! } });
  const ad = JSON.parse(arch!.data); ad.parts = [{ ...ad.parts[0], name: 'hair tie' }];
  await prisma.forgeItem.update({ where: { id: arch!.id }, data: { data: JSON.stringify(ad) } });
  const bills = await prisma.forgeItem.findFirst({ where: { campaignId: C, name: 'Folded Paper Bills' }, select: { id: true } });
  const five = await prisma.campaignItem.findFirst({ where: { campaignId: C, name: 'Five-dollar bill with her number' }, select: { id: true } });
  await prisma.campaignItem.update({ where: { id: five!.id }, data: { sourceForgeItemId: bills!.id } });
  console.log('hair ties fixed; the numbered five filed under', bills!.id);
}
main().finally(() => prisma.$disconnect());
