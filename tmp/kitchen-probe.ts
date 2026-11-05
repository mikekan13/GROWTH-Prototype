import { prisma } from '@/lib/db';
import { loadWorldLevel, thingStanding } from '@/services/spatial-world';
import { lineOfSight } from '@/lib/spatial';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const { map } = await loadWorldLevel(camp!.id);
  const kitchen = map.rooms.find(r => r.name === 'Kitchenette')!;
  const things = await prisma.campaignItem.findMany({ where: { campaignId: camp!.id, holderId: null }, select: { id: true, name: true, locationId: true, status: true } });
  for (const t of things) {
    const s = await thingStanding(map, t.id);
    if (!s || s.room?.id !== kitchen.id) continue;
    console.log(t.name, t.status, 'loc', t.locationId?.slice(-4), 'at', JSON.stringify(s.point), 'stored', s.stored, 'los', lineOfSight(map, { x: 150, y: 950 }, s.point));
  }
  const rows = await prisma.lastKnown.findMany({ where: { campaignId: camp!.id, roomId: kitchen.id } });
  console.log('kitchen LK rows', rows.length);
}
main().then(() => process.exit(0));
