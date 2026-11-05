import { prisma } from '../app/src/lib/db';
(async () => {
  const rows = await (prisma as any).dayaIntention.findMany({ where: { status: 'PENDING', entity: { character: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' } } }, select: { description: true, trigger: true, cadence: true, dueCycle: true, entity: { select: { character: { select: { name: true } } } } } });
  for (const r of rows) console.log(r.entity.character.name, '|', JSON.stringify(r.description.slice(0, 90)), '| trig:', r.trigger, '| cad:', r.cadence, '| due:', r.dueCycle);
  process.exit(0);
})();
