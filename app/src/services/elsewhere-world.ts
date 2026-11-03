/**
 * The database side of `elsewhere`: the places on the being's own level and on every other. Never throws (→ nothing is elsewhere).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { parseFootprint } from '@/lib/canvas-geometry';
import { levelOfBeing } from '@/services/spatial-world';
import { placesByLevel, type PlaceRow } from '@/services/elsewhere';

export async function placesOnLevels(campaignId: string, characterId: string): Promise<{ here: string[]; away: string[] }> {
  try {
    const level = await levelOfBeing(characterId);
    if (level === null) return { here: [], away: [] };
    const [locs, edges] = await Promise.all([
      prisma.location.findMany({ where: { campaignId, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } }),
      prisma.entityRelationship.findMany({ where: { relationshipType: 'located_at', sourceType: 'LOCATION', targetType: 'LOCATION' }, select: { sourceId: true, targetId: true } }),
    ]);
    const ids = new Set(locs.map((l) => l.id));
    const parent = new Map(edges.filter((e) => ids.has(e.sourceId)).map((e) => [e.sourceId, e.targetId]));
    const rows: PlaceRow[] = locs.map((l) => {
      let fp: ReturnType<typeof parseFootprint> = null;
      try { fp = parseFootprint((JSON.parse(l.data ?? '{}') as Record<string, unknown>).footprint); } catch { fp = null; }
      return { id: l.id, name: l.name, parentId: parent.get(l.id) ?? null, level: fp ? fp.level : null };
    });
    return placesByLevel(rows, level);
  } catch { return { here: [], away: [] }; }
}
