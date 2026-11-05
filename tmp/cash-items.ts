import { prisma } from '../app/src/lib/db';
async function main() {
  const items = await prisma.campaignItem.findMany({ where: { OR: [{ name: { contains: 'cash' } }, { name: { contains: 'bill' } }, { name: { contains: 'dollar' } }, { name: { contains: 'wallet' } }, { name: { contains: 'money' } }, { name: { contains: 'pizza' } }] } });
  for (const it of items) {
    const d = JSON.parse(it.data);
    console.log(`\n# ${it.name} id=${it.id} holder=${it.holderId} loc=${it.locationId}`);
    console.log(JSON.stringify(d, null, 1).slice(0, 1600));
    console.log('history:', it.history.slice(0, 600));
  }
  const cur = await prisma.currency.findMany();
  console.log('\n# currencies', JSON.stringify(cur, null, 1));
  const chars = await prisma.character.findMany({ where: { status: { in: ['ACTIVE', 'APPROVED'] } }, select: { id: true, name: true } });
  console.log('\n# chars', JSON.stringify(chars));
}
main().finally(() => prisma.$disconnect());
