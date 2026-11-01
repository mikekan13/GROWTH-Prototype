import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
(async () => {
  const dup = await prisma.campaignItem.findUnique({ where: { id: 'cmvx8rjvm005avg48hadffdk2' } });
  if (!dup) { console.log('no duplicate'); process.exit(0); }
  writeFileSync(`data/archive/dedupe-car-${Date.now()}.json`, JSON.stringify(dup, null, 2));
  await prisma.entityRelationship.deleteMany({ where: { OR: [{ sourceId: dup.id }, { targetId: dup.id }] } });
  await prisma.campaignItem.delete({ where: { id: dup.id } });
  const cars = await prisma.campaignItem.findMany({ where: { campaignId: dup.campaignId, status: 'ACTIVE', name: { contains: 'Fusion' } }, select: { id: true, name: true, locationId: true } });
  console.log('removed duplicate; cars left:', JSON.stringify(cars));
  process.exit(0);
})();
