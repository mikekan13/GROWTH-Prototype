/**
 * The world as a routine's planner sees it (daya/routines.ts RoutineWorld):
 * where the actor stands, the doors of its room (which lock is under its own
 * hand, which door is the way out, how far each is, whose home each belongs
 * to), the things in play (who holds what, where each lies, how far), and
 * every other person with how reachable they are and where they live.
 * Read fresh every beat from the live map — never cached.
 *
 * Stretch 2026-10-31: doors of OTHER homes that touch the actor's room are
 * listed too (her Entry door seen from the landing, `ofMyHome: false`) so the
 * planner can knock; things carry the room they lie in so the planner can go
 * where they are; people carry their home so an actor off the map can come to
 * its door.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { UNITS_PER_FT } from '@/lib/spatial/types';
import type { LevelMap } from '@/lib/spatial/types';

type Point = { x: number; y: number };
import { wayOutDoor } from '@/lib/spatial/targets';
import { parseOpenings } from '@/lib/canvas-geometry';
import { actorMap, lockOnActorsSide, whereOthersStand, type ActorMap } from '@/services/world-apply';
import { loadWorldLevel, levelOfBeing, beingStanding, thingStanding } from '@/services/spatial-world';
import type { Reach, RoutineWorld } from '@/daya/routines';

const ftBetween = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) / UNITS_PER_FT;
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const lower = (s: string) => s.trim().toLowerCase();

function reachOf(route: Array<{ kind: string; state?: string; name: string }> | null): { reach: Reach; doorBetween?: string } {
  if (!route) return { reach: 'none' };
  if (route.length === 0) return { reach: 'here' };
  const shut = route.filter((e) => e.kind === 'door' && e.state !== 'open');
  if (!shut.length) return { reach: route.length <= 1 ? 'through-open' : 'far' };
  if (route.length === 1) return { reach: 'beyond-door', doorBetween: shut[0].name };
  return { reach: 'far', doorBetween: shut[0].name };
}

function parseData(raw: string | null): Record<string, unknown> {
  try { const d = raw ? JSON.parse(raw) : {}; return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
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

    // Every Location once: names for things' rooms, homes for people, and other homes' doors that touch this room.
    const locations = await prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } });
    const locName = new Map(locations.map((l) => [l.id, l.name]));
    const parentOf = new Map<string, string>();
    for (const e of await prisma.entityRelationship.findMany({ where: { campaignId, relationshipType: 'located_at', sourceType: 'LOCATION', targetType: 'LOCATION' }, select: { sourceId: true, targetId: true } }).catch(() => [])) parentOf.set(e.sourceId, e.targetId);
    const homeOf = (locId: string | null): string | null => {
      if (!locId) return null;
      let cur = locId; const seen = new Set<string>();
      while (parentOf.has(cur) && !seen.has(cur)) { seen.add(cur); cur = parentOf.get(cur)!; }
      // The outermost place with its own openings is the home; a room under none is its own.
      return locName.get(cur) ?? null;
    };

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
        ofMyHome: true,
      };
    });
    if (doors.length && !doors.some((d) => d.wayOut)) {
      // No spatial reading of the way out: a door whose far side is not a room of the home leaves it.
      const leaving = doors.find((d) => d.mine) ?? (doors.length === 1 ? doors[0] : null);
      if (leaving) leaving.wayOut = true;
    }
    // Another home's door that opens onto this room (the landing side of her Entry door): seen, not owned.
    if (roomName) {
      for (const loc of locations) {
        if (amap && loc.id === amap.home.id) continue;
        for (const o of parseOpenings(parseData(loc.data).openings)) {
          if (o.kind !== 'door' || !o.between.some((b) => lower(b) === lower(roomName))) continue;
          if (doors.some((d) => d.id === o.id && lower(d.name) === lower(o.name ?? ''))) continue;
          const portal = level?.map.portals.find((p) => p.id === o.id && p.homeId === loc.id) ?? null;
          const distanceFt = portal && point ? ftBetween(point, mid(portal.a, portal.b)) : null;
          doors.push({
            id: o.id, name: o.name ?? `door between ${o.between.join(' and ')}`, state: o.state ?? 'closed', between: o.between,
            mine: false, wayOut: false, touchesMyRoom: true, distanceFt: distanceFt === null ? null : Math.round(distanceFt * 10) / 10, ofMyHome: false,
          });
        }
      }
    }

    // Things: everything held by anyone, everything lying in the actor's room, and everything lying anywhere the actor's
    // routines might send it for (any room — the planner goes where the thing is).
    const items = await prisma.campaignItem.findMany({
      where: { campaignId, status: 'ACTIVE' },
      select: { id: true, name: true, holderId: true, locationId: true },
      take: 400,
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
      things.push({
        id: it.id, name: it.name, holderId: it.holderId, holderName: it.holderId ? holders.get(it.holderId) ?? null : null,
        roomId: it.holderId ? null : it.locationId, roomName: it.holderId || !it.locationId ? null : locName.get(it.locationId) ?? null, distanceFt,
      });
    }

    // People: everyone else, placed relative to the actor by the passage graph, with the home they are in.
    const rows = await whereOthersStand(campaignId, actorId, amap);
    const roomIdByName = new Map(locations.map((l) => [lower(l.name), l.id]));
    const people: RoutineWorld['people'] = rows.map((w) => {
      const rid = w.roomName ? roomIdByName.get(lower(w.roomName)) ?? null : null;
      return { id: w.id, name: w.name, roomId: rid, roomName: w.roomName, homeName: homeOf(rid), ...reachOf(w.route) };
    });

    return { actor: { id: actor.id, name: actor.name, sex, roomId, roomName }, doors, things, people };
  } catch (err) {
    console.warn('[routine-world] unreadable (non-fatal):', err instanceof Error ? err.message : err);
    return null;
  }
}
