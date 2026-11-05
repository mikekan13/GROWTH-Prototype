import { prisma } from '@/lib/db';
import { stampBeingPoint } from '@/services/spatial-world';
async function main() {
  const v = await prisma.character.findFirst({ where: { name: 'Violet' }, select: { id: true } });
  const k = await prisma.character.findFirst({ where: { name: 'Kristopher' }, select: { id: true } });
  await stampBeingPoint(v!.id, { x: 150, y: 950 }); await stampBeingPoint(k!.id, { x: -50, y: 650 });
  const del = await prisma.session.deleteMany({ where: { token: { startsWith: 'probe-' } } });
  console.log('restored; probe sessions deleted:', del.count);
}
main().finally(() => prisma.$disconnect());
