import { prisma } from '../app/src/lib/db';
async function main() {
  const r = await prisma.campaignItem.findFirst({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', name: 'The water glass' } });
  const d = JSON.parse(r!.data); d.parts[0].name = 'water glass';
  await prisma.campaignItem.update({ where: { id: r!.id }, data: { data: JSON.stringify(d) } });
  console.log('water glass fixed');
}
main().finally(() => prisma.$disconnect());
