/**
 * Being presence (ruling 10, 2026-11-04): a quiet "this being is listening" mark for every viewer while its
 * record is built, and the matching "done" (a card was or will be posted, or the record was empty).
 * Delivered to every viewer; carries no story text.
 */
import { broadcastEvent } from '@/lib/campaign-stream';

export function emitBeingListening(
  campaignId: string,
  args: { characterId: string; characterName: string; lineId?: string | null },
): void {
  broadcastEvent(campaignId, {
    kind: 'being_listening',
    characterId: args.characterId,
    characterName: args.characterName,
    lineId: args.lineId ?? null,
    at: Date.now(),
  });
}

export function emitBeingDone(
  campaignId: string,
  args: { characterId: string; lineId?: string | null; posted: boolean },
): void {
  broadcastEvent(campaignId, {
    kind: 'being_done',
    characterId: args.characterId,
    lineId: args.lineId ?? null,
    posted: args.posted,
    at: Date.now(),
  });
}
