import { prisma } from '../app/src/lib/db';
import { loadWorldLevel, beingStanding } from '../app/src/services/spatial-world';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gt: new Date('2026-10-29T11:30:00Z') } }, orderBy: { createdAt: 'asc' } });
  for (const e of ev) { const pl = JSON.parse(e.payload ?? '{}'); console.log(e.createdAt.toISOString().slice(11, 19), e.type, e.characterName ?? '', JSON.stringify(pl).slice(0, 900)); console.log(); }
  const { map } = await loadWorldLevel(CAMP);
  for (const [n, id] of [['Violet', 'cms60ndtn0000kw48ioq10i68'], ['Kristopher', 'cmvcbw49u0001h448qanzbhs3']]) { const s = await beingStanding(map, id); console.log(n, 'in', s?.room?.name, JSON.stringify(s?.point)); }
  process.exit(0);
})();
