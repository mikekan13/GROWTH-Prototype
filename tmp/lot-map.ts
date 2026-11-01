import { prisma } from '../app/src/lib/db';
import { loadWorldLevel } from '../app/src/services/spatial-world';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  for (const lvl of [0, 1, null]) {
    const w = await loadWorldLevel(C, lvl as number | null).catch((e) => ({ err: String(e) }));
    const rooms = 'map' in w ? w.map.rooms.map((r: { name: string; id: string }) => r.name) : w;
    console.log('level', lvl, JSON.stringify(rooms).slice(0, 300));
  }
  const lot = await prisma.location.findUnique({ where: { id: 'cmvx7dojt0019vg48ue45siw5' }, select: { data: true } });
  const d = JSON.parse(lot!.data || '{}'); console.log('lot footprint:', JSON.stringify(d.footprint).slice(0, 400));
  const asp = await prisma.location.findUnique({ where: { id: 'cmvx8qwny0052vg48nwda5s23' }, select: { data: true } });
  const ad = JSON.parse(asp!.data || '{}'); console.log('asphalt footprint:', JSON.stringify(ad.footprint).slice(0, 300));
  const k = await prisma.character.findUnique({ where: { id: 'cmvcbw49u0001h448qanzbhs3' }, select: { data: true } });
  const kd = JSON.parse(k!.data || '{}'); console.log('kris keys with point/map:', Object.keys(kd).filter((x) => /point|map|canvas|stand/i.test(x)), JSON.stringify(kd.mapPoint ?? kd.standing ?? null));
  process.exit(0);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
