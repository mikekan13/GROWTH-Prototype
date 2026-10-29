/** HW10 2026-10-29: Violet's act "her back against the wall beside the door" walked her to the bathroom door; put her
 *  where the act meant — inside, against the entry door. Usage (from app/): npx tsx --tsconfig ../tmp/tsconfig.recall.json ../tmp/violet-to-the-door.ts */
import { moveBeing } from '../app/src/services/being-movement';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const HOME = 'cmv5x69xp004y1448l1sqlkjc';
(async () => {
  const walk = await moveBeing(CAMP, VIOLET, { kind: 'portal', portalId: 'op-1', homeId: HOME }, { cause: 'sim' });
  console.log(walk.ok ? `Violet walked to the entry door (${walk.feet?.toFixed?.(1) ?? '?'} ft)` : `FAIL ${walk.reason}`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
