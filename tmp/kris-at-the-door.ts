import { prisma } from '../app/src/lib/db';
import { setCanvasPosition } from '../app/src/services/character';
import { moveCharacterToLocation } from '../app/src/services/character-location';
import { loadWorldLevel, beingStanding } from '../app/src/services/spatial-world';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
const LANDING = 'cmvcbw49e0000h448cse3yfzr';
(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  const { map } = await loadWorldLevel(CAMP);
  const entry = map.portals.find((p) => p.name === 'Entry door')!;
  const mid = { x: (entry.a.x + entry.b.x) / 2, y: (entry.a.y + entry.b.y) / 2 };
  // Two and a half feet out from the door, on the landing side (the landing lies to the west of the main room).
  const at = { x: Math.round(mid.x - 50), y: Math.round(mid.y) };
  await moveCharacterToLocation(admin!.id, 'ADMIN', { characterId: KRIS, locationId: LANDING });
  await setCanvasPosition(KRIS, admin!.id, 'ADMIN', { x: at.x, y: at.y });
  const s = await beingStanding(map, KRIS);
  console.log('Kristopher at', JSON.stringify(s?.point), 'in', s?.room?.name, '| entry door at', JSON.stringify(mid), entry.state);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
