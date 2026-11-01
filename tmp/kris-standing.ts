import { prisma } from '../app/src/lib/db';
import { loadWorldLevel, levelOfBeing, beingStanding, thingStanding, stampBeingPoint } from '../app/src/services/spatial-world';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3', CAR = 'cmvcfyn460009zc48xhwl6kb8';
(async () => {
  const lvl = await levelOfBeing(K);
  const world = await loadWorldLevel(C, lvl);
  const ks = await beingStanding(world.map, K);
  const cs = await thingStanding(world.map, CAR);
  console.log('level', lvl, '| Kristopher:', JSON.stringify(ks), '| car:', JSON.stringify(cs));
  if (process.argv.includes('--fix') && cs?.point) { const n = await stampBeingPoint(K, cs.point); console.log('stamped Kristopher at the car:', JSON.stringify(cs.point), n); }
  process.exit(0);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
