/**
 * Perception feed switch (unit 9, default OFF). One helper for both sides:
 *   - server: PERCEPTION_FEED, else NEXT_PUBLIC_PERCEPTION_FEED
 *   - client: NEXT_PUBLIC_PERCEPTION_FEED (inlined at build — changing it needs a dev-server restart)
 * 'on' or 'true' turns it on.
 */
/** Window event: the stream nudged a perceived-feed reader (CampaignCanvas → CampaignTerminal re-reads). */
export const PERCEIVED_FEED_STALE_EVENT = 'growth:perceived-feed-stale';

export function perceptionFeedOn(): boolean {
  const server = typeof window === 'undefined' ? process.env.PERCEPTION_FEED : undefined;
  const v = server ?? process.env.NEXT_PUBLIC_PERCEPTION_FEED;
  return v === 'on' || v === 'true';
}
