/** One-off (2026-10-17): size a home's existing openings to the 5-ft grid. Usage: npx tsx ../tmp/resize-openings.ts <homeLocationId> */
import { prisma } from '../app/src/lib/db';
import { DEFAULT_SCALE_FT_PER_UNIT as S, footprintBounds, gridSizedOpening, parseFootprint, parseOpenings, snapOpeningToWall, wallEdges, type Point } from '../app/src/lib/canvas-geometry';

async function main() {
  const homeId = process.argv[2];
  const home = await prisma.location.findUniqueOrThrow({ where: { id: homeId } });
  const data = JSON.parse(home.data) as Record<string, unknown>;
  const fp = parseFootprint(data.footprint);
  if (!fp) throw new Error('home not drawn');
  const anchor = footprintBounds(fp.points);
  const toFt = (p: Point) => ({ x: (p.x - anchor.x) * S, y: (p.y - anchor.y) * S });
  const toW = (p: Point) => ({ x: anchor.x + p.x / S, y: anchor.y + p.y / S });
  const kids = await prisma.entityRelationship.findMany({ where: { targetId: homeId, relationshipType: 'located_at', sourceType: 'LOCATION' }, select: { sourceId: true } });
  const rooms = await prisma.location.findMany({ where: { id: { in: kids.map(k => k.sourceId) } } });
  const polys = [{ owner: home.name, points: fp.points.map(toFt) }];
  for (const r of rooms) { const rf = parseFootprint((JSON.parse(r.data) as Record<string, unknown>).footprint); if (rf) polys.push({ owner: r.name, points: rf.points.map(toFt) }); }
  const edges = wallEdges(polys);
  const openings = parseOpenings(data.openings).map(o => {
    const on = snapOpeningToWall(toFt(o.a), toFt(o.b), edges);
    const g = gridSizedOpening(o.kind, on.from, on.to, on.wall);
    console.log(o.name ?? o.id, o.kind, `${Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y) * S} ft →`, Math.hypot(g.to.x - g.from.x, g.to.y - g.from.y), 'ft');
    return { ...o, a: toW(g.from), b: toW(g.to) };
  });
  await prisma.location.update({ where: { id: homeId }, data: { data: JSON.stringify({ ...data, openings }) } });
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
