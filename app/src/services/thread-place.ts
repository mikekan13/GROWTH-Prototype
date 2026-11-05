// Finding 86 (2026-11-05): where a live thread says the other being is — read from the campaign's own Locations, never from a keyword list.
import { prisma } from '@/lib/db';
import { liveSignals } from './item-signal';
import { placeFromThread } from '@/daya/intentions';

/**
 * The Location the other party of one of `characterId`'s live threads names (a message "I'm already here" at a place in the thread),
 * or null. The being's own current room never matches. Never throws.
 */
export async function threadPlaceFor(campaignId: string, characterId: string, cycle: number): Promise<string | null> {
  try {
    const items = await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', holderId: characterId, data: { contains: '"signal"' } }, select: { data: true } });
    const texts: string[] = [];
    for (const it of items) {
      let d: unknown = null; try { d = it.data ? JSON.parse(it.data) : null; } catch { d = null; }
      for (const s of liveSignals(d, cycle)) if (s.by !== characterId) texts.push(s.words ?? '', s.text ?? '');
    }
    if (!texts.some((t) => t.trim())) return null;
    const [locs, edge] = await Promise.all([
      prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true } }),
      prisma.entityRelationship.findFirst({ where: { campaignId, sourceId: characterId, relationshipType: 'located_at', targetType: 'LOCATION' }, select: { targetId: true } }),
    ]);
    const here = locs.find((l) => l.id === edge?.targetId)?.name;
    return placeFromThread(texts, locs.map((l) => l.name), here ? [here] : []);
  } catch (err) {
    console.warn('[thread-place] thread place not read (non-fatal):', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Finding 86 (2026-11-05): does this room have a way out of the building on the map — an opening whose far side is "outside" or
 * "stairs down" (the map's own vocabulary; `openingSides` reads the same words)? A landing or a lot does; a kitchenette does not.
 * This is the data signal that a being who just stepped into it has LEFT, not merely changed rooms. Never throws.
 */
export async function roomOpensOutward(campaignId: string, roomName: string): Promise<boolean> {
  try {
    const rows = await prisma.location.findMany({ where: { campaignId }, select: { name: true, data: true } });
    const row = rows.find((l) => l.name.toLowerCase() === roomName.toLowerCase());
    if (!row?.data) return false;
    let d: { openings?: Array<{ between?: unknown }> } | null = null;
    try { d = JSON.parse(row.data) as { openings?: Array<{ between?: unknown }> }; } catch { d = null; }
    const openings = Array.isArray(d?.openings) ? d!.openings! : [];
    return openings.some((o) => Array.isArray(o.between) && (o.between as unknown[]).some((b) => typeof b === 'string' && /^(?:outside|stairs down)$/i.test(b.trim())));
  } catch {
    return false;
  }
}
