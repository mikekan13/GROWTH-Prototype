/**
 * Seat labels — what the model is told about WHO plays a character, with no
 * account name (anonymity ruling 2026-10-16: no username reaches a model;
 * FIRST-TEST plan E). The campaign's Watcher is "the Watcher"; other
 * accounts are "Player 1", "Player 2"… in membership order. Stable within a
 * campaign so JEWL can still tell seats apart; never the username.
 */
import 'server-only';
import { prisma } from '@/lib/db';

export type SeatLabels = Map<string, string>;

/** Pure: label userIds given the GM and the ordered member ids. */
export function labelSeats(gmUserId: string | null | undefined, memberUserIds: string[]): SeatLabels {
  const labels: SeatLabels = new Map();
  if (gmUserId) labels.set(gmUserId, 'the Watcher');
  let n = 0;
  for (const id of memberUserIds) {
    if (labels.has(id)) continue;
    labels.set(id, `Player ${++n}`);
  }
  return labels;
}

export async function seatLabelsFor(campaignId: string): Promise<SeatLabels> {
  const [campaign, members] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } }),
    prisma.campaignMember.findMany({ where: { campaignId }, orderBy: { joinedAt: 'asc' }, select: { userId: true } }),
  ]);
  return labelSeats(campaign?.gmUserId, members.map(m => m.userId));
}

/** The label for one account; an account outside the campaign is "an outside account". */
export function seatLabel(labels: SeatLabels, userId: string | null | undefined): string {
  if (!userId) return '—';
  return labels.get(userId) ?? 'an outside account';
}
