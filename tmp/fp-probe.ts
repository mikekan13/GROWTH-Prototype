import { prisma } from '@/lib/db';
import { parseFootprint } from '@/lib/canvas-geometry';
import { buildLevelMap } from '@/lib/spatial';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const locs = await prisma.location.findMany({ where: { campaignId: camp!.id }, select: { id: true, name: true, status: true, data: true } });
  for (const l of locs) {
    const d = JSON.parse(l.data || '{}');
    const fp = parseFootprint(d.footprint);
    console.log(l.name, l.status, 'raw level/scale:', JSON.stringify(d.footprint?.level), JSON.stringify(d.footprint?.scale), 'parsed:', fp ? `${fp.points.length}pts level=${fp.level}` : 'NULL', 'firstPt', JSON.stringify(d.footprint?.points?.[0]));
  }
  for (const lv of [0, 3, 4]) { const m = buildLevelMap({ locations: locs, level: lv }); console.log('level', lv, 'rooms', m.rooms.length, 'portals', m.portals.length); }
}
main().finally(() => prisma.$disconnect());
