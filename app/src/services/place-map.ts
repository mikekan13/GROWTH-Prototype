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
import { DEFAULT_LEVEL, DEFAULT_SCALE_FT_PER_UNIT, footprintBounds, parseFootprint, pointInPolygon, worldToFraction, type Point } from '@/lib/canvas-geometry';
import { setLocationGeometry, setTokenPosition } from './placement-geometry';
import { moveCharacterToLocation } from './character-location';

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
  })).max(30),
  tokens: z.array(z.object({
    thing: z.string().min(1).max(200).describe('A thing on the floor of a room, or a person (exact name or id).'),
    atFt: ftPoint.describe('Where it stands, in feet, in the HOME\'s frame. People take a 5-ft square; centre them in it.'),
  })).max(200),
});
export type PlaceMapPlan = z.infer<typeof placeMapSchema>;

export interface PlaceMapReport {
  homeId: string;
  rooms: string[];
  placed: string[];
  people: string[];
  errors: string[];
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
  const anchor = homeAnchor(homeData, home.status);
  const level = plan.level ?? parseFootprint(homeData.footprint)?.level ?? DEFAULT_LEVEL;
  const report: PlaceMapReport = { homeId: home.id, rooms: [], placed: [], people: [], errors: [] };

  const toWorld = (pts: Array<{ x: number; y: number }>) => pts.map(p => ftToWorld(p, anchor));
  await setLocationGeometry(campaignId, home.id, actor.userId, actor.role, {
    footprint: { points: toWorld(plan.outlineFt), scale: DEFAULT_SCALE_FT_PER_UNIT, level, ...(plan.ceilingFt ? { height: plan.ceilingFt } : {}) },
  });

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
    const points = toWorld(r.outlineFt);
    await setLocationGeometry(campaignId, room.id, actor.userId, actor.role, {
      footprint: { points, scale: DEFAULT_SCALE_FT_PER_UNIT, level, ...(r.ceilingFt ? { height: r.ceilingFt } : plan.ceilingFt ? { height: plan.ceilingFt } : {}) },
    });
    roomPolys.push({ id: room.id, name: room.name, points });
    report.rooms.push(room.name);
  }
  const roomAt = (p: Point) => roomPolys.find(r => pointInPolygon(p, r.points)) ?? null;

  // Tokens: things on a room's floor get their spot; people stand where named.
  const [items, people] = await Promise.all([
    prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE' }, select: { id: true, name: true } }),
    prisma.character.findMany({ where: { campaignId, status: { not: 'RETIRED' } }, select: { id: true, name: true, data: true } }),
  ]);
  const find = <T extends { id: string; name: string }>(rows: T[], ref: string) =>
    rows.find(r => r.id === ref) ?? rows.find(r => r.name.toLowerCase() === ref.trim().toLowerCase());

  for (const t of plan.tokens) {
    const world = ftToWorld(t.atFt, anchor);
    const room = roomAt(world);
    const item = find(items, t.thing);
    if (item) {
      const edge = await prisma.entityRelationship.findFirst({
        where: { sourceId: item.id, relationshipType: 'located_at', targetType: 'LOCATION' },
        select: { id: true, targetId: true },
      });
      if (!edge) { report.errors.push(`"${item.name}" is not on a room's floor (inside a container, or unplaced) — place it first`); continue; }
      if (!room || room.id !== edge.targetId) {
        const inRoom = roomPolys.find(r => r.id === edge.targetId)?.name ?? 'another room';
        report.errors.push(`"${item.name}" is in ${inRoom}, but (${t.atFt.x},${t.atFt.y}) ft is ${room ? `in ${room.name}` : 'outside every room'}`);
        continue;
      }
      await setTokenPosition(room.id, edge.id, actor.userId, actor.role, worldToFraction(world, footprintBounds(room.points)));
      report.placed.push(item.name);
      continue;
    }
    const person = find(people, t.thing);
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
  if (plan.rooms.length > 0 && roomPolys.length === 0) throw new ValidationError(`No room drawn: ${report.errors.join('; ')}`);
  return report;
}
