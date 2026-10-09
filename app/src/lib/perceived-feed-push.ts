/**
 * Perceived-feed push (perception hardening, PERCEPTION_FEED): when a character's memory row that a feed
 * line can rest on is written (noticed, with a canon ref), tell the viewers who read THAT character's feed
 * to re-read it — the character's owner, and the campaign's Watcher (who may be viewing as that character).
 *
 * The event carries no text, only which character's memory moved, and goes to each of those users alone
 * (targetUserId). Writes inside one moment (a round's witness pass, a listening stretch) coalesce into one
 * push per character. Best-effort: never throws, never blocks the memory write.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { perceptionFeedOn } from '@/lib/perception-feed';
import { broadcastEvent } from '@/lib/campaign-stream';

/** Writes this close together for one being = one push. */
export const PUSH_COALESCE_MS = 400;

const g = globalThis as typeof globalThis & { __perceivedFeedPushTimers?: Map<string, ReturnType<typeof setTimeout>> };
const timers = (g.__perceivedFeedPushTimers ??= new Map());

/** Who reads this being's feed: its owner and its campaign's Watcher. Null = not a campaign character. */
export async function feedReadersOf(entityId: string): Promise<{ campaignId: string; characterId: string; userIds: string[] } | null> {
  const e = await prisma.dayaEntity.findUnique({
    where: { id: entityId },
    select: { characterId: true, character: { select: { userId: true, campaignId: true, campaign: { select: { gmUserId: true } } } } },
  });
  const ch = e?.character;
  if (!e || !ch?.campaignId) return null;
  const userIds = [...new Set([ch.userId, ch.campaign?.gmUserId].filter((u): u is string => !!u))];
  return { campaignId: ch.campaignId, characterId: e.characterId, userIds };
}

/** Push now (no coalescing). Exported for tests. */
export async function pushMemoryWrittenNow(entityId: string): Promise<void> {
  const r = await feedReadersOf(entityId);
  if (!r) return;
  for (const userId of r.userIds) broadcastEvent(r.campaignId, { kind: 'perceived_feed_stale', characterId: r.characterId }, userId);
}

/** A memory row was written for this being. Flag off → nothing. */
export function notifyMemoryWritten(entityId: string): void {
  if (!perceptionFeedOn()) return;
  const prev = timers.get(entityId);
  if (prev) clearTimeout(prev);
  timers.set(entityId, setTimeout(() => {
    timers.delete(entityId);
    pushMemoryWrittenNow(entityId).catch((err) => console.warn('[perceived-feed-push] push failed', err));
  }, PUSH_COALESCE_MS));
}
