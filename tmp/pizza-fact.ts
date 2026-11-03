import { prisma } from '../app/src/lib/db';
(async () => { const c = await prisma.campaign.findUniqueOrThrow({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { currentCycle: true } });
  await prisma.worldFact.create({ data: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', subjectKey: 'violet.friday_pizza', fact: "Violet ate Friday night's pizza that same night; the box is long gone.", establishedAtCycle: 0.0022460 } });
  console.log('pizza fact recorded; clock', c.currentCycle); process.exit(0); })();
