/** Smoke test of the movement cap. RUN FROM A FOLDER HOLDING A COPY of dev.db (the client opens cwd/dev.db). */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
import { moveBeing } from '../app/src/services/being-movement';
import { loadWorldLevel, levelOfBeing } from '../app/src/services/spatial-world';
async function main() {
  if (!(process.env.GROWTH_DB_PATH ?? '').includes('scratchpad')) throw new Error('set GROWTH_DB_PATH to a scratch copy');
  const V = 'cms60ndtn0000kw48ioq10i68';
  // A level with several rooms: put her on it (this is a COPY), at its first room, and walk to the farthest one.
  const { arriveOnMap } = await import('../app/src/services/being-movement');
  let map: Awaited<ReturnType<typeof loadWorldLevel>>['map'] | null = null; let lvl = 0;
  for (const l of [0, 1, 2, 3, 4, 5, 10, 20, 30, 40, -1]) { try { const m = (await loadWorldLevel('cms5z4j6z0000zg48z5vzl2jn', l)).map; if (m.rooms.length >= 3) { map = m; lvl = l; break; } } catch { /* next */ } }
  if (!map) throw new Error('no level with 3+ rooms');
  const c = (r: { points: Array<{ x: number; y: number }> }) => ({ x: r.points.reduce((a, p) => a + p.x, 0) / r.points.length, y: r.points.reduce((a, p) => a + p.y, 0) / r.points.length });
  const arrived = await arriveOnMap('cms5z4j6z0000zg48z5vzl2jn', V, c(map.rooms[0]), { level: lvl });
  console.log('level', lvl, 'arrived', JSON.stringify(arrived));
  map.rooms.sort((a, b) => Math.hypot(c(b).x - c(map!.rooms[0]).x, c(b).y - c(map!.rooms[0]).y) - Math.hypot(c(a).x - c(map!.rooms[0]).x, c(a).y - c(map!.rooms[0]).y));
  console.log('rooms on her level:', map.rooms.map((r) => r.name).join(' | '));
  const rooms = map.rooms.map((r) => r.name);
  const kitchen = map.rooms.find((r) => /kitchen/i.test(r.name)) ?? map.rooms[map.rooms.length - 1];
  const target = { kind: 'room' as const, roomId: kitchen.id };
  console.log('target:', kitchen.name);
  for (let i = 0; i < 12; i++) {
    const w = await moveBeing('cms5z4j6z0000zg48z5vzl2jn', V, target, { cause: 'sim', maxSeconds: 2, world: undefined });
    console.log(`step ${i}: ok=${w.ok} ${w.fromRoom}→${w.toRoom} feet=${w.feet} s=${w.seconds} opened=[${w.opened}] partial=${w.partial ? w.partial.remainingSeconds + 's left' : 'no'}${w.reason ? ' reason=' + w.reason : ''}`);
    if (!w.ok || !w.partial) break;
  }
  const g = await moveBeing('cms5z4j6z0000zg48z5vzl2jn', V, { kind: 'room', roomId: map.rooms.find((r) => /landing/i.test(r.name))!.id }, { cause: 'gm' });
  console.log(`uncapped (gm): ${g.fromRoom}→${g.toRoom} feet=${g.feet} partial=${g.partial ? 'YES (bug)' : 'no'}`);
}
main().finally(() => prisma.$disconnect());
