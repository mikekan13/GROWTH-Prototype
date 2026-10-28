/**
 * PLACE MAP — a home drawn to scale on the map (Mike 2026-10-17: "have Jewl
 * draw the apartment and put everything where it should be — we are assuming
 * normal 5 foot space rules for a token like in typical trpgs").
 *
 * One plan, in FEET, in the HOME's own frame (origin = the home outline's
 * top-left, x right, y down): the home outline, each room's outline inside
 * it, and where each thing / person stands. Stored in WORLD units at the map
 * scale (DEFAULT_SCALE_FT_PER_UNIT: 20 units = 1 ft, so one 5-ft square =
 * 100 units = a person's token):
 *   Location.data.footprint.points — absolute world coords (the canvas draws
 *     a footprinted place AT its footprint);
 *   an item's located_at edge data.position — fraction of its ROOM's box;
 *   a person's data.canvasX/Y (+ canvasPlacedAt so it beats an older drag).
 * The home keeps where it already is on the map (its footprint's corner, else
 * its canvas anchor, else a default spot below the line while PLANNING).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { DEFAULT_LEVEL, DEFAULT_SCALE_FT_PER_UNIT, GRID_FT, HALF_GRID_FT, cellCentre, footprintBounds, gridSizedOpening, makeMapShape, openingSides, parseFootprint, parseOpenings, pointInPolygon, snapOpeningToWall, snapOutline, snapTo, wallEdges, worldToFraction, type DoorState, type Opening, type Point } from '@/lib/canvas-geometry';
import { updateLocation } from './location';
import { setLocationGeometry, setTokenPosition } from './placement-geometry';
import { moveCharacterToLocation } from './character-location';
import { doorWritten } from './door-facts';

const ftPoint = z.object({ x: z.number().min(0).max(5000), y: z.number().min(0).max(5000) });

export const placeMapSchema = z.object({
  home: z.string().min(1).max(200).describe('The home / building Location (name or id).'),
  outlineFt: z.array(ftPoint).min(3).max(64).describe('The home\'s outline in feet, clockwise from its top-left (0,0).'),
  ceilingFt: z.number().min(4).max(500).optional(),
  level: z.number().int().min(-50).max(500).optional(),
  rooms: z.array(z.object({
    name: z.string().min(1).max(200).describe('An existing room inside the home (name or id).'),
    outlineFt: z.array(ftPoint).min(3).max(64).describe('The room\'s outline in feet, in the HOME\'s frame (same origin).'),
    ceilingFt: z.number().min(4).max(500).optional(),
  })).max(30).default([]),
  tokens: z.array(z.object({
    thing: z.string().min(1).max(200).describe('A thing on the floor of a room, or a person (exact name or id).'),
    atFt: ftPoint.describe('Where it stands (its CENTRE), in feet, in the HOME\'s frame. People take a 5-ft square; centre them in it.'),
    sizeFt: z.object({ w: z.number().min(0.2).max(200), d: z.number().min(0.2).max(200) }).optional()
      .describe('Things: the floor space it really covers, width × depth in feet (a couch 7×3, a bed 5×6.5). Under 5 ft on both sides it shows as a pin.'),
    outlineFt: z.array(ftPoint).min(3).max(32).optional().describe('Things: an irregular floor shape instead of sizeFt (an L-desk), in feet.'),
    rotation: z.number().optional().describe('Things: 0, 90, 180 or 270 — turns the shape.'),
  })).max(200).default([]),
  openings: z.array(z.object({
    kind: z.enum(['door', 'window', 'archway', 'opening']),
    fromFt: ftPoint.describe('One end of the opening ON a wall line, feet, home frame (a door\'s hinge side).'),
    toFt: ftPoint.describe('The other end, on the same wall (a door is usually 3 ft wide, a window 3–4 ft).'),
    between: z.array(z.string().min(1).max(200)).min(1).max(2).describe('What it joins: room names, or "outside" / "stairwell" / "fire escape".'),
    state: z.enum(['open', 'closed', 'locked']).optional().describe('Doors only: how it stands right now.'),
    name: z.string().max(80).optional(),
  })).max(40).optional().describe('Doors, windows, archways. REPLACES the home\'s openings when given.'),
});
export type PlaceMapPlan = z.infer<typeof placeMapSchema>;

export interface PlaceMapReport {
  homeId: string;
  rooms: string[];
  placed: string[];
  people: string[];
  openings?: number;
  errors: string[];
}

/** Open / close / lock a door on a home's map (the tap on the canvas, or JEWL). */
export async function setDoorState(
  campaignId: string,
  actor: { userId: string; role: string },
  homeId: string,
  openingId: string,
  state: DoorState,
): Promise<Opening> {
  const loc = await prisma.location.findUnique({ where: { id: homeId }, select: { campaignId: true, data: true } });
  if (!loc || loc.campaignId !== campaignId) throw new NotFoundError('Location not found');
  const data = parseData(loc.data);
  const openings = parseOpenings(data.openings);
  const o = openings.find(x => x.id === openingId);
  if (!o) throw new NotFoundError('Opening not found');
  if (o.kind !== 'door') throw new ValidationError('Only a door opens, closes and locks');
  o.state = state;
  await updateLocation(homeId, campaignId, actor.userId, actor.role, { data: { ...data, openings } });
  // The map is the one writer: the door's fact follows it, every canvas redraws.
  const home = await prisma.location.findUnique({ where: { id: homeId }, select: { name: true } });
  await doorWritten(campaignId, { id: homeId, name: home?.name ?? 'home' }, { id: o.id, name: o.name ?? 'Door', state });
  return o;
}

/** Feet in the home frame → world units, anchored at `anchor`. Pure. */
export function ftToWorld(p: { x: number; y: number }, anchor: Point, ftPerUnit = DEFAULT_SCALE_FT_PER_UNIT): Point {
  return { x: Math.round((anchor.x + p.x / ftPerUnit) * 100) / 100, y: Math.round((anchor.y + p.y / ftPerUnit) * 100) / 100 };
}

/** Where the home's top-left lands on the map. Pure. */
export function homeAnchor(data: Record<string, unknown>, status: string): Point {
  const fp = parseFootprint(data.footprint);
  if (fp) { const b = footprintBounds(fp.points); return { x: b.x, y: b.y }; }
  const x = typeof data.canvasX === 'number' ? data.canvasX : 0;
  const y = typeof data.canvasY === 'number' ? data.canvasY : 600;
  // Drafting places live below the crystallization line (y > 0).
  return { x, y: status === 'ACTIVE' ? y : Math.max(200, y) };
}

function parseData(raw: string | null): Record<string, unknown> {
  try { const d = raw ? JSON.parse(raw) : {}; return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}

export async function drawPlaceMap(
  campaignId: string,
  actor: { userId: string; role: string },
  input: unknown,
): Promise<PlaceMapReport> {
  const plan = placeMapSchema.parse(input);
  const locations = await prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true, status: true, data: true } });
  const byRef = (ref: string) => locations.find(l => l.id === ref) ?? locations.find(l => l.name.toLowerCase() === ref.trim().toLowerCase());
  const home = byRef(plan.home);
  if (!home) throw new NotFoundError(`No Location "${plan.home}" in this campaign`);
  const homeData = parseData(home.data);
  // A redrawn home lands ON the 5-ft grid (2026-10-17: "it should snap to that as best it can").
  const rawAnchor = homeAnchor(homeData, home.status);
  const gridUnits = GRID_FT / DEFAULT_SCALE_FT_PER_UNIT;
  const anchor = plan.outlineFt ? { x: snapTo(rawAnchor.x, gridUnits), y: snapTo(rawAnchor.y, gridUnits) } : rawAnchor;
  const level = plan.level ?? parseFootprint(homeData.footprint)?.level ?? DEFAULT_LEVEL;
  const report: PlaceMapReport = { homeId: home.id, rooms: [], placed: [], people: [], errors: [] };

  const toWorld = (pts: Array<{ x: number; y: number }>) => pts.map(p => ftToWorld(p, anchor));
  const toFt = (p: Point): Point => ({ x: (p.x - anchor.x) * DEFAULT_SCALE_FT_PER_UNIT, y: (p.y - anchor.y) * DEFAULT_SCALE_FT_PER_UNIT });
  const homeOutlineFt = plan.outlineFt ? snapOutline(plan.outlineFt) : null;
  if (homeOutlineFt) {
    await setLocationGeometry(campaignId, home.id, actor.userId, actor.role, {
      footprint: { points: toWorld(homeOutlineFt), scale: DEFAULT_SCALE_FT_PER_UNIT, level, ...(plan.ceilingFt ? { height: plan.ceilingFt } : {}) },
    });
  } else if (!parseFootprint(homeData.footprint)) {
    throw new ValidationError(`${home.name} is not drawn yet — give its outlineFt`);
  }

  // Rooms: must already be inside the home (organize_place makes them).
  const childEdges = await prisma.entityRelationship.findMany({
    where: { campaignId, targetId: home.id, relationshipType: 'located_at', sourceType: 'LOCATION' },
    select: { sourceId: true },
  });
  const childIds = new Set(childEdges.map(e => e.sourceId));
  const roomPolys: Array<{ id: string; name: string; points: Point[] }> = [];
  for (const r of plan.rooms) {
    const room = byRef(r.name);
    if (!room || !childIds.has(room.id)) { report.errors.push(`room "${r.name}" is not a room inside ${home.name}`); continue; }
    const points = toWorld(snapOutline(r.outlineFt));
    await setLocationGeometry(campaignId, room.id, actor.userId, actor.role, {
      footprint: { points, scale: DEFAULT_SCALE_FT_PER_UNIT, level, ...(r.ceilingFt ? { height: r.ceilingFt } : plan.ceilingFt ? { height: plan.ceilingFt } : {}) },
    });
    roomPolys.push({ id: room.id, name: room.name, points });
    report.rooms.push(room.name);
  }
  // A point on a shared wall lies in two rooms: prefer the thing's own room,
  // else the smallest room that holds the point.
  const area = (pts: Point[]) => { const b = footprintBounds(pts); return b.width * b.height; };
  // Rooms not redrawn in this call keep their drawn shape for placing tokens.
  for (const id of childIds) {
    if (roomPolys.some(r => r.id === id)) continue;
    const l = locations.find(x => x.id === id);
    const fp = l ? parseFootprint(parseData(l.data).footprint) : null;
    if (l && fp) roomPolys.push({ id: l.id, name: l.name, points: fp.points });
  }
  const roomAt = (p: Point, prefer?: string) => {
    const hits = roomPolys.filter(r => pointInPolygon(p, r.points));
    return hits.find(r => r.id === prefer) ?? hits.sort((x, y) => area(x.points) - area(y.points))[0] ?? null;
  };

  // Tokens: things on a room's floor get their spot; people stand where named.
  const [items, people] = await Promise.all([
    prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, name: true } }),
    prisma.character.findMany({ where: { campaignId, status: { not: 'RETIRED' } }, select: { id: true, name: true, data: true } }),
  ]);
  const find = <T extends { id: string; name: string }>(rows: T[], ref: string) =>
    rows.find(r => r.id === ref) ?? rows.find(r => r.name.toLowerCase() === ref.trim().toLowerCase());

  for (const t of plan.tokens) {
    const item = find(items, t.thing);
    // On the grid: a person stands in a 5-ft square's centre, a thing on a half-square's.
    const step = item ? HALF_GRID_FT : GRID_FT;
    const world = ftToWorld({ x: cellCentre(t.atFt.x, step), y: cellCentre(t.atFt.y, step) }, anchor);
    if (item) {
      const edge = await prisma.entityRelationship.findFirst({
        where: { sourceId: item.id, relationshipType: 'located_at', targetType: 'LOCATION' },
        select: { id: true, targetId: true },
      });
      const room = roomAt(world, edge?.targetId);
      if (!edge) { report.errors.push(`"${item.name}" is not on a room's floor (inside a container, or unplaced) — place it first`); continue; }
      if (!room || room.id !== edge.targetId) {
        const inRoom = roomPolys.find(r => r.id === edge.targetId)?.name ?? 'another room';
        report.errors.push(`"${item.name}" is in ${inRoom}, but (${t.atFt.x},${t.atFt.y}) ft is ${room ? `in ${room.name}` : 'outside every room'}`);
        continue;
      }
      await setTokenPosition(room.id, edge.id, actor.userId, actor.role, worldToFraction(world, footprintBounds(room.points)));
      // The floor space it takes (Mike 2026-10-17: "items can take up space too").
      const shape = makeMapShape({ sizeFt: t.sizeFt, outlineFt: t.outlineFt, rotation: t.rotation });
      if (shape) {
        const row = await prisma.campaignItem.findUnique({ where: { id: item.id }, select: { data: true } });
        await prisma.campaignItem.update({ where: { id: item.id }, data: { data: JSON.stringify({ ...parseData(row?.data ?? null), mapShape: shape }) } });
      }
      report.placed.push(item.name);
      continue;
    }
    const person = find(people, t.thing);
    const room = roomAt(world);
    if (person) {
      if (!room) { report.errors.push(`${person.name}: (${t.atFt.x},${t.atFt.y}) ft is outside every room`); continue; }
      await moveCharacterToLocation(actor.userId, actor.role, { characterId: person.id, locationId: room.id });
      const d = parseData(person.data);
      await prisma.character.update({
        where: { id: person.id },
        data: { data: JSON.stringify({ ...d, canvasX: world.x, canvasY: world.y, canvasPlacedAt: Date.now() }) },
      });
      report.people.push(person.name);
      continue;
    }
    report.errors.push(`no thing or person named "${t.thing}"`);
  }
  if (plan.openings) {
    // Every opening goes ON a real wall, and what it joins is READ FROM THE
    // WALLS, never trusted from the plan (2026-10-17: the bathroom door was
    // drawn on the outer wall — a door to outside).
    const homeFt = homeOutlineFt ?? (() => { const fp = parseFootprint(homeData.footprint); return fp ? fp.points.map(toFt) : null; })();
    const roomsFt = roomPolys.map(r => ({ owner: r.name, points: r.points.map(toFt) }));
    const edges = wallEdges([...roomsFt, ...(homeFt ? [{ owner: home.name, points: homeFt }] : [])]);
    const roomNames = new Set(roomPolys.map(r => r.name.toLowerCase()));
    const openings: Opening[] = plan.openings.map((o, i) => {
      const onWall = snapOpeningToWall(o.fromFt, o.toFt, edges);
      const snapped = { ...gridSizedOpening(o.kind, onWall.from, onWall.to, onWall.wall), wall: onWall.wall };
      const sides = openingSides(snapped.from, snapped.to, roomsFt, homeFt);
      const exteriorLabel = o.between.find(b => !roomNames.has(b.toLowerCase()) && b.toLowerCase() !== 'outside');
      const between = sides.map(sd => (sd === 'outside' && exteriorLabel ? exteriorLabel : sd));
      const wanted = o.between.filter(b => roomNames.has(b.toLowerCase()));
      const missing = wanted.filter(w => !sides.some(sd => sd.toLowerCase() === w.toLowerCase()));
      const label = o.name ?? `${o.kind} ${i + 1}`;
      if (missing.length > 0 || (sides.includes('outside') && !o.between.some(b => !roomNames.has(b.toLowerCase())))) {
        report.errors.push(`${label}: you said it joins ${o.between.join(' ↔ ')}, but (${o.fromFt.x},${o.fromFt.y})→(${o.toFt.x},${o.toFt.y}) ft is on the wall between ${sides.join(' ↔ ') || 'nothing'} — move it onto the right wall`);
      }
      return {
        id: `op-${i + 1}`,
        kind: o.kind,
        a: ftToWorld(snapped.from, anchor),
        b: ftToWorld(snapped.to, anchor),
        between,
        ...(o.kind === 'door' ? { state: o.state ?? 'closed' } : {}),
        ...(o.name ? { name: o.name } : {}),
      };
    });
    const fresh = parseData((await prisma.location.findUnique({ where: { id: home.id }, select: { data: true } }))?.data ?? null);
    await updateLocation(home.id, campaignId, actor.userId, actor.role, { data: { ...fresh, openings } });
    report.openings = openings.length;
  }
  if (plan.rooms.length > 0 && roomPolys.length === 0) throw new ValidationError(`No room drawn: ${report.errors.join('; ')}`);
  return report;
}
