/**
 * CAPACITY (Mike 2026-10-16): "things can only hold things if it
 * realistically could. I can't put a whale in my apartment."
 *
 * Everything is a container; every holder has room for so much:
 *   item holder  → data.capacityCuFt / data.capacityLbs
 *   room (Location) → footprint polygon area × scale² × height
 *                     (height defaults to 9 ft; no footprint = unknown)
 *   contents     → Σ data.volumeCuFt / data.weightLbs of what sits DIRECTLY
 *                  in it (a book in a bookcase is counted in the bookcase)
 *
 * Unknown volume or capacity is ALLOWED with a warning — stock is being
 * backfilled with volumes; the law bites as soon as the numbers exist.
 * `fits` is pure; `checkFit` / `assertFits` read the DB.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { parseFootprint, type Point } from '@/lib/canvas-geometry';

export const DEFAULT_ROOM_HEIGHT_FT = 9;

export interface Holder { name: string; capacityCuFt?: number | null; capacityLbs?: number | null }
export interface Bulk { name?: string; volumeCuFt?: number | null; weightLbs?: number | null }
export interface FitResult { ok: boolean; reason?: string; warnings: string[]; leftCuFt?: number; leftLbs?: number }

const known = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** Would `incoming` fit in `holder` beside `contents`? Pure. */
export function fits(holder: Holder, contents: Bulk[], incoming: Bulk): FitResult {
  const warnings: string[] = [];
  const what = incoming.name ?? 'it';
  const out: FitResult = { ok: true, warnings };
  if (known(holder.capacityCuFt)) {
    const used = contents.reduce((a, c) => a + (known(c.volumeCuFt) ? c.volumeCuFt : 0), 0);
    const left = holder.capacityCuFt - used;
    out.leftCuFt = left;
    if (!known(incoming.volumeCuFt)) warnings.push(`${what} has no volume yet — placed unchecked`);
    else if (incoming.volumeCuFt > left) {
      return { ok: false, warnings, leftCuFt: left, reason: `a ${what} (${fmt(incoming.volumeCuFt)} cu ft) does not fit in ${holder.name} (${fmt(Math.max(0, left))} cu ft left)` };
    }
  } else {
    warnings.push(`${holder.name} has no capacity yet — placed unchecked`);
  }
  if (known(holder.capacityLbs)) {
    const used = contents.reduce((a, c) => a + (known(c.weightLbs) ? c.weightLbs : 0), 0);
    const left = holder.capacityLbs - used;
    out.leftLbs = left;
    if (known(incoming.weightLbs) && incoming.weightLbs > left) {
      return { ok: false, warnings, leftCuFt: out.leftCuFt, leftLbs: left, reason: `a ${what} (${fmt(incoming.weightLbs)} lbs) is too heavy for ${holder.name} (${fmt(Math.max(0, left))} lbs left)` };
    }
  }
  return out;
}

/** Shoelace area of a polygon, in its own units². Pure. */
export function polygonArea(points: Point[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** A room's volume in cu ft from Location.data.footprint (null when it has none). Pure. */
export function roomCapacityCuFt(locationData: Record<string, unknown>): number | null {
  const fp = parseFootprint(locationData.footprint);
  if (!fp) return null;
  const height = fp.height ?? DEFAULT_ROOM_HEIGHT_FT;
  return polygonArea(fp.points) * fp.scale * fp.scale * height;
}

function parse(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

/** The bulk of an item from its data (volume + weight). Pure. */
export function bulkOf(name: string, data: Record<string, unknown>): Bulk {
  return { name, volumeCuFt: known(data.volumeCuFt) ? data.volumeCuFt : null, weightLbs: known(data.weightLbs) ? data.weightLbs : null };
}

/**
 * Does `incoming` fit in this place (a Location or a holder item), beside
 * what already sits directly in it? `excludeId` = the item being moved (it
 * does not crowd itself).
 */
export async function checkFit(
  place: { kind: 'location' | 'item'; id: string; name: string },
  incoming: Bulk,
  excludeId?: string,
): Promise<FitResult> {
  let holder: Holder;
  if (place.kind === 'location') {
    const loc = await prisma.location.findUnique({ where: { id: place.id }, select: { name: true, data: true } });
    holder = { name: loc?.name ?? place.name, capacityCuFt: roomCapacityCuFt(parse(loc?.data)) };
  } else {
    const it = await prisma.campaignItem.findUnique({ where: { id: place.id }, select: { name: true, data: true } });
    const d = parse(it?.data);
    holder = { name: it?.name ?? place.name, capacityCuFt: known(d.capacityCuFt) ? d.capacityCuFt : null, capacityLbs: known(d.capacityLbs) ? d.capacityLbs : null };
  }
  // Nothing to measure against: skip the content read.
  if (!known(holder.capacityCuFt) && !known(holder.capacityLbs)) return fits(holder, [], incoming);
  const edges = await prisma.entityRelationship.findMany({
    where: { targetId: place.id, relationshipType: 'located_at', sourceType: 'CAMPAIGN_ITEM' },
    select: { sourceId: true },
  });
  const ids = edges.map(e => e.sourceId).filter(id => id !== excludeId);
  const rows = ids.length
    ? await prisma.campaignItem.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { name: true, data: true } })
    : [];
  return fits(holder, rows.map(r => bulkOf(r.name, parse(r.data))), incoming);
}

/** checkFit, refusing over-capacity with the reason. Returns the warnings. */
export async function assertFits(
  place: { kind: 'location' | 'item'; id: string; name: string },
  incoming: Bulk,
  excludeId?: string,
): Promise<string[]> {
  const r = await checkFit(place, incoming, excludeId);
  if (!r.ok) throw new ValidationError(r.reason ?? 'does not fit');
  return r.warnings;
}
