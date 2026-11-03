import { prisma } from '../app/src/lib/db';
(async () => {
  const C = 'cms5z4j6z0000zg48z5vzl2jn';
  const cur = await prisma.worldFact.findFirst({ where: { campaignId: C, subjectKey: 'kristopher.location.current', supersededById: null } });
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true } });
  const f = await prisma.worldFact.create({ data: { campaignId: C, subjectKey: 'kristopher.location.current', fact: 'Kristopher sits in the driver\'s seat of his 2017 Ford Fusion Energi, engine off, parked in the lot behind his hotel, just off his Chess Pizza shift. He is in the car, not at any door.', establishedAtCycle: camp.currentCycle } });
  if (cur) await prisma.worldFact.update({ where: { id: cur.id }, data: { supersededById: f.id } });
  console.log('Kristopher seat fact set', cur ? '(superseded the old one)' : ''); process.exit(0);
})();
