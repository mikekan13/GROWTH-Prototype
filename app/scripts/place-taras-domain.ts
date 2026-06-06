/**
 * One-shot data fix: stamp canvas positions on Tara's three possessions so
 * they actually appear on the canvas instead of floating at index-based
 * default coords that drift as new Locations are added.
 *
 * Spatial intent (Mike can drag from here):
 * - Tara is at roughly (-610, 200). She's located_at Tree of Life, which
 *   should encompass her — placing Tree of Life slightly up-left so its
 *   folder forms a visible territory around her.
 * - River Styx is the OTHER cosmic pole (per [[tiberoak-etymology-2026-06-03]] —
 *   Tiber/Styx + Oak/Tree). Place it on the opposite side of Tara's region.
 * - Undead Army serves Lady Death. Place it below and between, so it reads
 *   as adjacent-but-distinct from both poles.
 *
 * Mike owns the final layout — this is a starting visibility fix.
 */
import { prisma } from '../src/lib/db';

const PLACEMENTS: Record<string, { x: number; y: number }> = {
  'Tree of Life': { x: -900, y: 50 },
  'River Styx':   { x:  300, y: 150 },
  'Undead Army':  { x: -300, y: 450 },
};

const main = async () => {
  for (const [name, coords] of Object.entries(PLACEMENTS)) {
    const loc = await prisma.location.findFirst({ where: { name } });
    if (!loc) {
      console.log(`[skip] no Location named "${name}"`);
      continue;
    }
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(loc.data) as Record<string, unknown>; } catch { /* start empty */ }
    data.canvasX = coords.x;
    data.canvasY = coords.y;
    await prisma.location.update({
      where: { id: loc.id },
      data: { data: JSON.stringify(data) },
    });
    console.log(`[ok] ${name} → (${coords.x}, ${coords.y})`);
  }
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
