import { prisma } from '../src/lib/db';

/**
 * Seed directional krmaReserve values into each of Tara's possession
 * Locations and the 10 Sephirot rooms. Numbers are scale-suggestive,
 * not gospel — Mike adjusts in-app.
 *
 * Scale rough cut:
 *   - Tree of Life      ≈ 50 B Ҝ  (cosmic axis / Tower of Sephirot)
 *   - River Styx        ≈ 25 B Ҝ  (cosmic river / erasure conduit)
 *   - Undead Army       ≈ 10 B Ҝ  (standing cosmic force)
 *   - Sephirot rooms    ≈ 1 B Ҝ each (sub-rooms of the Tower)
 */

const RESERVES: Record<string, number> = {
  'Tree of Life': 50_000_000_000,
  'River Styx':   25_000_000_000,
  'Undead Army':  10_000_000_000,
  // Sephirot — same magnitude across the 10. The GM can rebalance.
  Malkuth:    1_000_000_000,
  Yesod:      1_000_000_000,
  Hod:        1_000_000_000,
  Netzach:    1_000_000_000,
  Tiphareth:  1_000_000_000,
  Geburah:    1_000_000_000,
  Chesed:     1_000_000_000,
  Binah:      1_000_000_000,
  Chokmah:    1_000_000_000,
  Keter:      1_000_000_000,
};

(async () => {
  const locations = await prisma.location.findMany({
    where: { name: { in: Object.keys(RESERVES) } },
    select: { id: true, name: true, data: true },
  });

  for (const loc of locations) {
    const reserve = RESERVES[loc.name];
    if (reserve == null) continue;
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(loc.data) as Record<string, unknown>; } catch { /* start fresh */ }
    parsed.krmaReserve = reserve;
    await prisma.location.update({
      where: { id: loc.id },
      data: { data: JSON.stringify(parsed) },
    });
    console.log(`  · ${loc.name.padEnd(14)} ← ${reserve.toLocaleString()} Ҝ`);
  }

  console.log(`\nSet reserves on ${locations.length} Locations.`);
  await prisma.$disconnect();
})();
