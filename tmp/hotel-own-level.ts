/** The hotel world is ELSEWHERE (2026-11-02): JEWL drew the lot on Violet's map level beside her apartment, so the
 *  engine put Kristopher in her earshot. Every hotel/Chess Pizza place goes to its own level. */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const LEVELS: Record<string, number> = { 'The Hotel': 10, 'Room 214': 10, 'Hotel Parking Lot': 10, 'Asphalt': 10, 'Chess Pizza': 20 };
(async () => {
  const locs = await prisma.location.findMany({ where: { campaignId: C, name: { in: Object.keys(LEVELS) } }, select: { id: true, name: true, data: true } });
  writeFileSync(`data/archive/hotel-own-level-${Date.now()}.json`, JSON.stringify(locs, null, 1));
  for (const l of locs) {
    const d = JSON.parse(l.data || '{}');
    if (!d.footprint) { console.log(`${l.name}: undrawn — level kept in spec only`); continue; }
    const was = d.footprint.level; d.footprint.level = LEVELS[l.name];
    await prisma.location.update({ where: { id: l.id }, data: { data: JSON.stringify(d) } });
    console.log(`${l.name}: level ${was} → ${LEVELS[l.name]}`);
  }
  process.exit(0);
})();
