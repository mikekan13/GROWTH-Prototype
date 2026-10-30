/**
 * The world as a routine's planner sees it (daya/routines.ts RoutineWorld):
 * where the actor stands, the doors of its room (which lock is under its own
 * hand, which door is the way out, how far each is), the things in play (who
 * holds what, how far), and every other person with how reachable they are.
 * Read fresh every beat from the live map — never cached.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { UNITS_PER_FT } from '@/lib/spatial/types';
import type { LevelMap } from '@/lib/spatial/types';

type Point = { x: number; y: number };
import { wayOutDoor } from '@/lib/spatial/targets';
import { actorMap, lockOnActorsSide, whereOthersStand, type ActorMap } from '@/services/world-apply';
import { loadWorldLevel, levelOfBeing, beingStanding, thingStanding } from '@/services/spatial-world';
import type { Reach, RoutineWorld } from '@/daya/routines';

const ftBetween = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) / UNITS_PER_FT;
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function reachOf(route: Array<{ kind: string; state?: string; name: string }> | null): { reach: Reach; doorBetween?: string } {
  if (!route) return { reach: 'none' };
  if (route.length === 0) return { reach: 'here' };
  const shut = route.filter((e) => e.kind === 'door' && e.state !== 'open');
  if (!shut.length) return { reach: route.length <= 1 ? 'through-open' : 'far' };
  if (route.length === 1) return { reach: 'beyond-door', doorBetween: shut[0].name };
  return { reach: 'far', doorBetween: shut[0].name };
}

/** Never throws: a world that cannot be read is null, and the routine waits a beat. */
export async function routineWorldFor(campaignId: string, actorId: string, opts: { sex?: string | null } = {}): Promise<RoutineWorld | null> {
  try {
    const actor = await prisma.character.findUnique({ where: { id: actorId }, select: { id: true, name: true, campaignId: true, data: true } });
    if (!actor || actor.campaignId !== campaignId) return null;
    let sex: string | null = opts.sex ?? null;
    if (!sex) { try { const d = JSON.parse(actor.data ?? '{}') as { identity?: { sex?: string; physicalDescription?: { gender?: string } } }; sex = d.identity?.sex || d.identity?.physicalDescription?.gender || null; } catch { sex = null; } }
    const amap: ActorMap | null = await actorMap(actorId).catch(() => null);
    let level: { map: LevelMap } | null = null;
    try { level = await loadWorldLevel(campaignId, await levelOfBeing(actorId)); } catch { level = null; }
    const standing = level ? await beingStanding(level.map, actorId).catch(() => null) : null;
    const point = standing?.point ?? null;
    const room = standing?.room ?? null;
    const roomId = room?.id ?? amap?.roomId ?? null;
    const roomName = room?.name ?? amap?.roomName ?? null;

    // Doors: the actor map's doors (state, between, home) with the spatial engine's reading of each.
    const out = level && room ? wayOutDoor(level.map, room, point) : null;
    const doors: RoutineWorld['doors'] = (amap?.doors ?? []).map((d) => {
      const portal = level?.map.portals.find((p) => p.id === d.id && p.homeId === d.homeId) ?? null;
      const distanceFt = portal && point ? ftBetween(point, mid(portal.a, portal.b)) : null;
      return {
        id: d.id, name: d.name, state: d.state, between: d.between,
        mine: amap ? lockOnActorsSide(amap, d) : false,
        wayOut: !!out && out.id === d.id,
        touchesMyRoom: true,
        distanceFt: distanceFt === null ? null : Math.round(distanceFt * 10) / 10,
      };
    });
    if (doors.length && !doors.some((d) => d.wayOut)) {
      // No spatial reading of the way out: a door whose far side is not a room of the home leaves it.
      const leaving = doors.find((d) => d.mine) ?? (doors.length === 1 ? doors[0] : null);
      if (leaving) leaving.wayOut = true;
    }

    // Things: everything held by anyone, and everything lying in the actor's room.
    const items = await prisma.campaignItem.findMany({
      where: { campaignId, status: 'ACTIVE', OR: [{ holderId: { not: null } }, ...(roomId ? [{ locationId: roomId, holderId: null }] : [])] },
      select: { id: true, name: true, holderId: true, locationId: true },
      take: 200,
    });
    const holders = new Map<string, string>();
    const holderIds = [...new Set(items.map((i) => i.holderId).filter((x): x is string => !!x))];
    if (holderIds.length) for (const h of await prisma.character.findMany({ where: { id: { in: holderIds } }, select: { id: true, name: true } })) holders.set(h.id, h.name);
    const things: RoutineWorld['things'] = [];
    for (const it of items) {
      let distanceFt: number | null = null;
      if (!it.holderId && it.locationId === roomId && level && point) {
        const st = await thingStanding(level.map, it.id).catch(() => null);
        if (st) distanceFt = Math.round(ftBetween(point, st.point) * 10) / 10;
      } else if (it.holderId === actorId) distanceFt = 0;
      things.push({ id: it.id, name: it.name, holderId: it.holderId, holderName: it.holderId ? holders.get(it.holderId) ?? null : null, roomId: it.holderId ? null : it.locationId, distanceFt });
    }

    // People: everyone else, placed relative to the actor by the passage graph.
    const rows = await whereOthersStand(campaignId, actorId, amap);
    const people: RoutineWorld['people'] = rows.map((w) => ({ id: w.id, name: w.name, roomId: null, roomName: w.roomName, ...reachOf(w.route) }));

    return { actor: { id: actor.id, name: actor.name, sex, roomId, roomName }, doors, things, people };
  } catch (err) {
    console.warn('[routine-world] unreadable (non-fatal):', err instanceof Error ? err.message : err);
    return null;
  }
}
