import { prisma } from '../app/src/lib/db';
import { ensureDefaultTimescale } from '../app/src/services/time';
import { cycleToLocalDate } from '../app/src/types/time';
import { DAY_CYCLES } from '../app/src/daya/intentions';
(async () => {
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { currentCycle: true } });
  const ts = await ensureDefaultTimescale('cms5z4j6z0000zg48z5vzl2jn') as any;
  const f = c.currentCycle / DAY_CYCLES; const frac = f - Math.floor(f);
  console.log('cycle', c.currentCycle, 'local', JSON.stringify(cycleToLocalDate(c.currentCycle, ts)), 'hours into day', (frac * 24).toFixed(2));
  if (process.argv.includes('--set10')) { const target = (Math.floor(f) + 22 / 24) * DAY_CYCLES; await prisma.campaign.update({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, data: { currentCycle: target } }); console.log('set to 22:00 →', target); }
  process.exit(0);
})();
