/**
 * Trait-blossom events (Dialed to Eleven, Michael 2026-11-05): when a trait mechanic
 * generates or expires a blossom inside a service path, say so on the campaign event
 * stream. Best effort - a failed write never blocks the play that caused it.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { diffBlossoms } from '@/lib/character-actions';
import type { GrowthCharacter } from '@/types/growth';

export async function recordBlossomEvents(input: {
  campaignId: string | null | undefined;
  characterId: string;
  characterName?: string;
  before: GrowthCharacter;
  after: GrowthCharacter;
}): Promise<void> {
  const diffs = diffBlossoms(input.before, input.after);
  for (const d of diffs) {
    console.log(`[trait_blossom] ${d.action} ${d.name} (${d.source ?? '?'}) on ${input.characterId}`);
    if (!input.campaignId) continue;
    try {
      await prisma.campaignEvent.create({
        data: {
          campaignId: input.campaignId,
          type: 'trait_blossom',
          actor: 'system', actorUserId: '', actorName: 'system',
          characterId: input.characterId,
          characterName: input.characterName,
          payload: JSON.stringify({ action: d.action, name: d.name, source: d.source, characterId: input.characterId }),
        },
      });
    } catch { /* swallow */ }
  }
}
