// Finding 86 (2026-11-05): where a live thread says the other being is — read from the campaign's own Locations, never from a keyword list.
import { prisma } from '@/lib/db';
import { liveSignals } from './item-signal';
import { withMessages } from './world-messages';
import { placeFromThread } from '@/daya/intentions';
import { locationAliases } from '@/lib/location-aliases';

/**
 * The Location the other party of one of `characterId`'s live threads names (a message "I'm already here" at a place in the thread),
 * or null. The being's own current room never matches. Never throws.
 */
export async function threadPlaceFor(campaignId: string, characterId: string, cycle: number): Promise<string | null> {
  try {
    const items = await withMessages(campaignId, await prisma.campaignItem.findMany({ where: { campaignId, status: 'ACTIVE', holderId: characterId }, select: { id: true, data: true } }), cycle);
    const texts: string[] = [];
    for (const it of items) {
      for (const s of liveSignals(it.data, cycle)) if (s.by !== characterId) texts.push(s.words ?? '', s.text ?? '');
    }
    if (!texts.some((t) => t.trim())) return null;
    const [locs, edge] = await Promise.all([
      prisma.location.findMany({ where: { campaignId }, select: { id: true, name: true, data: true } }),
      prisma.entityRelationship.findFirst({ where: { campaignId, sourceId: characterId, relationshipType: 'located_at', targetType: 'LOCATION' }, select: { targetId: true } }),
    ]);
    const here = locs.find((l) => l.id === edge?.targetId)?.name;
    // Finding 96 (2026-11-05): a place has the names people call it by ("Extra Space Coffee" for "the coffee shop on Broadway") — the
    // Location's data.aliases[] — and the thread is matched against all of them; the canonical name is what comes back.
    const canon = new Map<string, string>();
    for (const l of locs) { canon.set(l.name.toLowerCase(), l.name); for (const al of locationAliases(l.data)) canon.set(al.toLowerCase(), l.name); }
    const exclude = here ? [here, ...locationAliases(locs.find((l) => l.name === here)?.data ?? null)] : [];
    const hit = placeFromThread(texts, [...canon.values(), ...[...canon.keys()].map((k) => k)].filter((v, i, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i), exclude);
    return hit ? canon.get(hit.toLowerCase()) ?? hit : null;
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
