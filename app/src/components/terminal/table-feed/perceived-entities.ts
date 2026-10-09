/**
 * Perceived feed (perception unit 9): the entities the feed's spans and chips
 * may open, built from the lines themselves. Pure, client-safe.
 *
 *   - every perceived line carries its entities as the viewer knows them
 *     (payload.perceived.entities): label + known aspect names — the tooltip
 *     shows only that; a portrait only when the viewer knows who it is;
 *   - the viewer's own lines (no `perceived` field; the server sends only those
 *     in full) keep their speaker's roster entry — a character knows itself.
 */
import type { TerminalEvent, PerceivedEntityRef } from '@/types/terminal';
import type { FeedEntity } from './TableFeedRows';

const KIND: Record<PerceivedEntityRef['kind'], FeedEntity['kind']> = { CHARACTER: 'character', NPC: 'npc', ITEM: 'item', LOCATION: 'location' };

export function perceivedFeedEntities(events: TerminalEvent[], roster: FeedEntity[]): FeedEntity[] {
  const byId = new Map(roster.map((e) => [e.id, e]));
  const out = new Map<string, FeedEntity>();
  for (const e of events) {
    const p = e.payload as { perceived?: { entities?: PerceivedEntityRef[] } } | undefined;
    const ents = p?.perceived?.entities;
    if (!ents) {
      if (e.characterId && !out.has(e.characterId) && byId.has(e.characterId)) out.set(e.characterId, byId.get(e.characterId)!);
      continue;
    }
    for (const r of ents) {
      out.set(r.id, {
        id: r.id,
        name: r.label,
        kind: KIND[r.kind] ?? 'character',
        portrait: r.named ? byId.get(r.id)?.portrait ?? null : null,
        known: r.known,
      });
    }
  }
  return [...out.values()];
}
