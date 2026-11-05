/** 2026-10-29: JEWL's draw_place_map call (asked to place furniture) redrew the apartment 20×16 and replaced its
 *  openings. Restore footprint + openings of the four locations from the checkpointed dev.db snapshot. */
import { prisma } from '../app/src/lib/db';
import { readFileSync } from 'fs';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const snap = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Record<string, { name: string; footprint: unknown; openings?: unknown; footprintAt?: unknown }>;
(async () => {
  const p = prisma as any;
  for (const [id, s] of Object.entries(snap)) {
    const row = await prisma.location.findUnique({ where: { id }, select: { data: true, name: true } });
    if (!row) { console.log('missing', id); continue; }
    const d = JSON.parse(row.data ?? '{}');
    const before = JSON.stringify({ f: d.footprint, o: d.openings });
    d.footprint = s.footprint;
    if (s.openings !== undefined) d.openings = s.openings; else delete d.openings;
    if (s.footprintAt !== undefined) d.footprintAt = s.footprintAt;
    const changed = before !== JSON.stringify({ f: d.footprint, o: d.openings });
    await prisma.location.update({ where: { id }, data: { data: JSON.stringify(d) } });
    console.log(changed ? 'restored' : 'unchanged', row.name);
  }
  // Door facts JEWL's openings may have written just now.
  const facts: any[] = await p.worldFact.findMany({ where: { campaignId: CAMP, supersededById: null }, select: { id: true, fact: true, subjectKey: true, establishedAtCycle: true } });
  const sus = facts.filter((f) => /front door|kitchenette door|window over desk/i.test(f.fact) || /front_door|kitchenette_door|window_over/i.test(f.subjectKey ?? ''));
  console.log('suspect door facts:', sus.length);
  for (const f of sus) console.log('   ', f.id, f.subjectKey, '|', f.fact.slice(0, 120));
  // Fog: what each being knows was seeded against the wrong doors; wipe and look around again.
  const wiped = await p.lastKnown.deleteMany({ where: { campaignId: CAMP } });
  const { loadWorldLevel, beingStanding } = await import('../app/src/services/spatial-world');
  const { lookAround } = await import('../app/src/services/spatial-perception');
  const { map } = await loadWorldLevel(CAMP);
  let looked = 0;
  for (const b of await prisma.character.findMany({ where: { campaignId: CAMP, status: { notIn: ['DEAD', 'RETIRED'] } }, select: { id: true } })) { const s = await beingStanding(map, b.id); if (s) { await lookAround(CAMP, b.id, map, s.point); looked++; } }
  console.log(`last-known wiped (${wiped.count}), ${looked} beings looked around; map rooms: ${map.rooms.map((r) => r.name).join(', ')}; portals: ${map.portals.map((q) => `${q.name}:${q.state ?? 'open'}`).join(', ')}`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
