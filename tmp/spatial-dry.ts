import { prisma } from '@/lib/db';
import { loadWorldLevel, beingStanding } from '@/services/spatial-world';
import { resolveMoveRef } from '@/services/being-movement';
import { findPath, lineOfSight, visibleRooms, portalsOfRoom, spotAtPortal } from '@/lib/spatial';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const { map } = await loadWorldLevel(camp!.id);
  console.log('rooms', map.rooms.map(r => `${r.name}(${Math.round(r.area)})`).join(' | '));
  console.log('portals', map.portals.map(p => `${p.id}@${p.homeId.slice(-4)} ${p.name} ${p.state ?? ''}`).join(' | '));
  console.log('walls', map.walls.length, 'obstacles', map.obstacles.length);
  const chars = await prisma.character.findMany({ where: { campaignId: camp!.id, name: { in: ['Violet', 'Kristopher'] } }, select: { id: true, name: true } });
  const st: Record<string, any> = {};
  for (const c of chars) { st[c.name] = await beingStanding(map, c.id); console.log(c.name, JSON.stringify(st[c.name] && { point: st[c.name].point, room: st[c.name].room?.name, stored: st[c.name].stored })); }
  const kris = chars.find(c => c.name === 'Kristopher')!; const vi = chars.find(c => c.name === 'Violet')!;
  for (const ref of ['the door', 'Entry door', 'Violet', 'Kitchenette', 'the bathroom door', 'bed']) {
    const r = await resolveMoveRef(camp!.id, ref, kris.id, { map });
    console.log('kris ref', JSON.stringify(ref), '->', JSON.stringify(r));
  }
  const entry = map.portals.find(p => p.name === 'Entry door')!;
  const kSpot = spotAtPortal(map, entry, st.Kristopher.point);
  const kPath = findPath(map, st.Kristopher.point, kSpot);
  console.log('kris -> door spot', JSON.stringify(kSpot), 'path', JSON.stringify(kPath && { pts: kPath.points, feet: kPath.feet, portals: kPath.portals.map(p => p.name), blockedBy: kPath.blockedBy?.name }));
  const vSpot = spotAtPortal(map, entry, st.Violet.point);
  const vPath = findPath(map, st.Violet.point, vSpot);
  console.log('violet -> door spot', JSON.stringify(vSpot), 'path', JSON.stringify(vPath && { pts: vPath.points, feet: vPath.feet, portals: vPath.portals.map(p => p.name) }));
  const kv = findPath(map, st.Kristopher.point, st.Violet.point);
  console.log('kris -> violet (door locked)', JSON.stringify(kv && { feet: kv.feet, blockedBy: kv.blockedBy?.name, end: kv.points.at(-1) }));
  console.log('LOS kris<->violet', lineOfSight(map, st.Kristopher.point, st.Violet.point), 'violet sees rooms', visibleRooms(map, st.Violet.point).map(r => r.name).join(','));
  console.log('main room portals', portalsOfRoom(map, map.rooms.find(r => r.name === 'Main Room')!).map(p => p.name).join(', '));
}
main().finally(() => prisma.$disconnect());
