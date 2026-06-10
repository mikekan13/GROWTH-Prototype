// One-time data repair: Location.data.krmaReserve values were written
// unbounded (Kether-Prime-Timeline held 10^18 — ten million times the
// entire 100B KRMA supply). Clamps any reserve above total supply down
// to the 100B ceiling. Idempotent.
import { prisma } from '../src/lib/db';
import { KRMA_TOTAL_SUPPLY } from '../src/services/location';

async function main() {
  const locs = await prisma.location.findMany({ select: { id: true, name: true, data: true } });
  let fixed = 0;
  for (const l of locs) {
    let d: Record<string, unknown>;
    try { d = JSON.parse(l.data || '{}'); } catch { continue; }
    const r = d.krmaReserve;
    if (typeof r === 'number' && (r > KRMA_TOTAL_SUPPLY || r < 0)) {
      const clamped = Math.min(Math.max(r, 0), KRMA_TOTAL_SUPPLY);
      d.krmaReserve = clamped;
      await prisma.location.update({ where: { id: l.id }, data: { data: JSON.stringify(d) } });
      console.log(`clamped: ${l.name} ${r} -> ${clamped}`);
      fixed++;
    }
  }
  console.log(`done — ${fixed} of ${locs.length} locations clamped`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
