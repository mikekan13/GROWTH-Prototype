import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const rows = await prisma.worldFact.findMany({ where: { campaignId: C, OR: [
    { subjectKey: { in: ['violet_position', 'kristopher_position', 'the_hotel.mozzarella_cooler', 'kristopher.personal_phone.contacts'] } },
    { subjectKey: { startsWith: 'kristopher_hotel.' }, fact: { contains: 'Asphalt' } },
  ] } });
  writeFileSync(`data/archive/position-facts-${Date.now()}.json`, JSON.stringify(rows, null, 1));
  const ids = rows.map((r) => r.id);
  await prisma.worldFact.updateMany({ where: { supersededById: { in: ids } }, data: { supersededById: null } });
  await prisma.worldFact.deleteMany({ where: { id: { in: ids } } });
  const left = await prisma.worldFact.findMany({ where: { campaignId: C, supersededById: null, OR: [{ fact: { contains: 'The Hotel' } }, { fact: { contains: 'landing' } }] }, select: { subjectKey: true, fact: true } });
  console.log(`removed ${ids.length} stale position facts; live facts still naming the hotel or the landing: ${left.length}`);
  for (const l of left) console.log('  ', l.subjectKey, '|', l.fact.slice(0, 120));
  process.exit(0);
})();
