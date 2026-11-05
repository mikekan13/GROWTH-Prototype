import { prisma } from '@/lib/db';
import { loadWorldLevel } from '@/services/spatial-world';
import { lineOfSight, crossesBlocking } from '@/lib/spatial';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const { map } = await loadWorldLevel(camp!.id);
  const a = { x: 150, y: 950 }, b = { x: 345, y: 665 };
  console.log('los', lineOfSight(map, a, b), JSON.stringify(crossesBlocking(map, a, b, 'sight')));
  console.log('portals', map.portals.map(p => `${p.id} ${p.kind} ${p.state ?? ''} (${p.a.x},${p.a.y})-(${p.b.x},${p.b.y}) ${p.between.join('/')}`).join(' | '));
  console.log('rooms', map.rooms.map(r => `${r.name}: ${r.points.map(p => `${p.x},${p.y}`).join(' ')}`).join(' | '));
}
main().then(() => process.exit(0));
