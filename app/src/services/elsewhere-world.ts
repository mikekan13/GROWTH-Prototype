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

/** True when the two beings stand on different map levels (both known). Never throws. */
export async function onDifferentLevels(a: string, b: string): Promise<boolean> {
  try {
    const [la, lb] = await Promise.all([levelOfBeing(a), levelOfBeing(b)]);
    return la !== null && lb !== null && la !== lb;
  } catch { return false; }
}

/**
 * The beings on another level that the actor KNOWS (an identity familiarity of theirs above zero) — the people a call from
 * here could reach (2026-11-02: "the bill she gave him… hits dial" names no one; the callee is whoever the caller knows).
 * Never throws.
 */
export async function knownElsewhere(campaignId: string, actorCharacterId: string): Promise<string[]> {
  try {
    const actorEntity = await prisma.dayaEntity.findUnique({ where: { characterId: actorCharacterId }, select: { id: true } });
    const others = await prisma.character.findMany({ where: { campaignId, id: { not: actorCharacterId }, status: { notIn: ['DEAD', 'RETIRED'] } }, select: { id: true } });
    const out: string[] = [];
    for (const o of others) {
      if (!(await onDifferentLevels(actorCharacterId, o.id))) continue;
      const rows = await prisma.familiarity.findMany({ where: { perceiverId: { in: [actorCharacterId, actorEntity?.id ?? '-'] }, subjectId: o.id }, select: { score: true } }).catch(() => [] as Array<{ score: number }>);
      if (rows.some((r) => (r.score ?? 0) > 0)) out.push(o.id);
    }
    return out;
  } catch { return []; }
}
