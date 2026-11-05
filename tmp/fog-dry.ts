import { prisma } from '@/lib/db';
import { loadWorldLevel, beingStanding } from '@/services/spatial-world';
import { perceiveMapChange } from '@/services/spatial-perception';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const { map } = await loadWorldLevel(camp!.id);
  const chars = await prisma.character.findMany({ where: { campaignId: camp!.id, status: { notIn: ['DEAD', 'RETIRED'] } }, select: { id: true, name: true } });
  const names = Object.fromEntries(chars.map(c => [c.id, c.name]));
  const vi = chars.find(c => c.name === 'Violet')!;
  const st = await beingStanding(map, vi.id);
  console.log('Violet stands', JSON.stringify(st?.point), st?.room?.name);
  const show = (label: string, r: Awaited<ReturnType<typeof perceiveMapChange>>) =>
    console.log(label, r ? Object.entries(r.perceivedBy).map(([id, g]) => `${names[id] ?? id}:${g}`).join(' ') + (r.roomPoint ? ` roomPoint=${JSON.stringify(r.roomPoint)}` : '') : 'UNGRADED');
  show('Violet -> entry door (25,645):', await perceiveMapChange(camp!.id, { kind: 'being', entityId: vi.id, at: { x: 25, y: 645 }, roomId: st!.room!.id, path: [st!.point, { x: 25, y: 645 }] }, { map }));
  const bath = map.rooms.find(r => /bath/i.test(r.name));
  if (bath) show('Violet -> bathroom:', await perceiveMapChange(camp!.id, { kind: 'being', entityId: vi.id, at: { x: 50, y: 975 }, roomId: bath.id }, { map }));
  const entry = map.portals.find(p => /entry/i.test(p.name))!;
  show('Entry door changes:', await perceiveMapChange(camp!.id, { kind: 'door', portalId: entry.id, homeId: entry.homeId }));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
