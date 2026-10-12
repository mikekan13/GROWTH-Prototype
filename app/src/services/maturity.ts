/**
 * Maturity — adult-only campaigns (Mike 2026-10-12): "a story if it involves
 * lurid or strong sexual things then it should be labeled as such and be
 * blocked from minors."
 *
 * - Any content in a campaign carrying the `sexual` maturity flag makes the
 *   campaign adultOnly (setBy 'auto'). Sources: the campaign's ForgeItems
 *   (drafts + published, data.maturityFlags), DayaMemoryEntry rows whose
 *   classification carries maturityFlags, and tone-filter notes
 *   (noteSexualContent → an AuditEntry, action MATURITY_FLAG).
 * - A Watcher may set adultOnly by hand (setBy 'watcher'). Auto never un-sets a
 *   watcher-set true; a Watcher may not un-set while flagged content exists.
 * - When a campaign turns adultOnly, under-18 members (lib/age#isAdult) are
 *   moved to status REMOVED (no rows deleted, characters kept) and the
 *   Watcher gets one line in their JEWL chat.
 * Never logs a date of birth.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { AdultOnlyError, canEnterAdultCampaign, canManageCampaign } from '@/lib/permissions';
import { ADULT_ONLY_FLAG } from '@/lib/maturity-flags';

/** CampaignMember.status for a member removed because the table turned 18+. */
export const REMOVED_STATUS = 'REMOVED';
const NOTE_ACTION = 'MATURITY_FLAG';

function carriesAdultFlag(json: string | null | undefined): boolean {
  if (!json || !json.includes(`"${ADULT_ONLY_FLAG}"`)) return false;
  try {
    const flags = (JSON.parse(json) as { maturityFlags?: unknown }).maturityFlags;
    return Array.isArray(flags) && flags.includes(ADULT_ONLY_FLAG);
  } catch {
    return false;
  }
}

const NOTES_CLEARED_ACTION = 'MATURITY_NOTES_CLEARED';

/** Tone-filter notes count only after the last ADMIN clear. */
async function notesSinceLastClear(campaignId: string): Promise<number> {
  const lastClear = await prisma.auditEntry.findFirst({
    where: { targetType: 'Campaign', targetId: campaignId, action: NOTES_CLEARED_ACTION },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  return prisma.auditEntry.count({
    where: {
      targetType: 'Campaign', targetId: campaignId, action: NOTE_ACTION,
      ...(lastClear ? { timestamp: { gt: lastClear.timestamp } } : {}),
    },
  });
}

/**
 * Does any content in this campaign carry `sexual`? `includeNotes: false`
 * looks only at the content itself (forge data, memory classification), not
 * at tone-filter notes — what ADMIN's clear checks.
 */
export async function campaignHasSexualContent(
  campaignId: string,
  opts: { includeNotes?: boolean } = {},
): Promise<boolean> {
  const needle = `"${ADULT_ONLY_FLAG}"`;
  const items = await prisma.forgeItem.findMany({
    where: { campaignId, data: { contains: needle } },
    select: { data: true },
  });
  if (items.some(i => carriesAdultFlag(i.data))) return true;

  if (opts.includeNotes !== false && (await notesSinceLastClear(campaignId)) > 0) return true;

  const memories = await prisma.dayaMemoryEntry.findMany({
    where: { classification: { contains: needle }, entity: { character: { campaignId } } },
    select: { classification: true },
    take: 50,
  });
  return memories.some(m => carriesAdultFlag(m.classification));
}

/**
 * Move under-18 members of an adultOnly campaign to REMOVED and tell the
 * Watcher. The campaign's own GM is never removed. Returns the count.
 */
export async function removeMinorMembers(campaignId: string, now: Date = new Date()): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, gmUserId: true, adultOnly: true },
  });
  if (!campaign?.adultOnly) return 0;
  const members = await prisma.campaignMember.findMany({
    where: { campaignId, status: { not: REMOVED_STATUS } },
    select: { id: true, userId: true, user: { select: { id: true, role: true, dateOfBirth: true } } },
  });
  const minors = members.filter(m => !canEnterAdultCampaign(m.user, campaign, now));
  if (minors.length === 0) return 0;
  await prisma.campaignMember.updateMany({
    where: { id: { in: minors.map(m => m.id) } },
    data: { status: REMOVED_STATUS },
  });
  const n = minors.length;
  await prisma.copilotMessage.create({
    data: {
      campaignId,
      role: 'assistant',
      content: `${n} member${n === 1 ? '' : 's'} removed: table is now 18+`,
      userId: campaign.gmUserId,
      actions: JSON.stringify({ source: 'MATURITY_ADULT_ONLY', removed: n }),
      // The wall: a real-world account fact, never fiction — never cloud.
      contentClass: 'real',
    },
  });
  return n;
}

async function audit(campaignId: string, actorId: string, actorType: string, action: string, metadata: Record<string, unknown>) {
  await prisma.auditEntry.create({
    data: {
      actorId, actorType, action,
      targetType: 'Campaign', targetId: campaignId,
      outcome: 'SUCCESS',
      metadata: JSON.stringify(metadata),
    },
  });
}

/**
 * Recompute adultOnly from the campaign's content. Flagged → true ('auto').
 * Unflagged → an AUTO-set true clears; a WATCHER-set true is never touched.
 */
export async function recomputeCampaignAdultOnly(
  campaignId: string,
  now: Date = new Date(),
): Promise<{ adultOnly: boolean; changed: boolean; removed: number }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, adultOnly: true, adultOnlySetBy: true },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');
  const flagged = await campaignHasSexualContent(campaignId);

  if (flagged && !campaign.adultOnly) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { adultOnly: true, adultOnlySetBy: 'auto', adultOnlyAt: now },
    });
    await audit(campaignId, 'system', 'SYSTEM', 'ADULT_ONLY_SET', { setBy: 'auto' });
    const removed = await removeMinorMembers(campaignId, now);
    return { adultOnly: true, changed: true, removed };
  }
  if (!flagged && campaign.adultOnly && campaign.adultOnlySetBy === 'auto') {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { adultOnly: false, adultOnlySetBy: null, adultOnlyAt: now },
    });
    await audit(campaignId, 'system', 'SYSTEM', 'ADULT_ONLY_CLEARED', { setBy: 'auto' });
    return { adultOnly: false, changed: true, removed: 0 };
  }
  return { adultOnly: campaign.adultOnly, changed: false, removed: 0 };
}

/**
 * Best-effort hook for content writes (forge create/update/publish/pull).
 * Never fails the write it follows.
 */
export async function recomputeCampaignAdultOnlySafe(campaignId: string | null | undefined): Promise<void> {
  if (!campaignId) return;
  try {
    await recomputeCampaignAdultOnly(campaignId);
  } catch (err) {
    console.warn('[maturity] adult-only recompute failed:', (err as Error).message);
  }
}

/**
 * The tone filter's hook: it screened text belonging to `campaignId` and
 * found sexual content. Records the note (ref only — never the text) and
 * recomputes, which turns the campaign adultOnly ('auto').
 */
export async function noteSexualContent(
  campaignId: string,
  ref: { table: string; id: string },
): Promise<{ adultOnly: boolean; changed: boolean; removed: number }> {
  await audit(campaignId, 'tone-filter', 'SYSTEM', NOTE_ACTION, { flag: ADULT_ONLY_FLAG, refTable: ref.table, refId: ref.id });
  return recomputeCampaignAdultOnly(campaignId);
}

/** Watcher's manual toggle (campaign settings). */
export async function setCampaignAdultOnly(
  campaignId: string,
  user: { id: string; role: string },
  adultOnly: boolean,
  now: Date = new Date(),
): Promise<{ adultOnly: boolean; adultOnlySetBy: string | null; removed: number }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, gmUserId: true, adultOnly: true, adultOnlySetBy: true },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(user.id, user.role, campaign)) {
    throw new ForbiddenError('Only the campaign GM can change this');
  }

  if (adultOnly) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { adultOnly: true, adultOnlySetBy: 'watcher', adultOnlyAt: campaign.adultOnly ? undefined : now },
    });
    await audit(campaignId, user.id, 'USER', 'ADULT_ONLY_SET', { setBy: 'watcher' });
    const removed = await removeMinorMembers(campaignId, now);
    return { adultOnly: true, adultOnlySetBy: 'watcher', removed };
  }

  if (!campaign.adultOnly) return { adultOnly: false, adultOnlySetBy: null, removed: 0 };
  if (await campaignHasSexualContent(campaignId)) {
    throw new ConflictError('This table carries content flagged sexual — it stays 18+ while that content exists');
  }
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { adultOnly: false, adultOnlySetBy: null, adultOnlyAt: now },
  });
  await audit(campaignId, user.id, 'USER', 'ADULT_ONLY_CLEARED', { setBy: 'watcher' });
  return { adultOnly: false, adultOnlySetBy: null, removed: 0 };
}

/**
 * Gate for join / interest / apply / GM-accept ("invite") / view: a user who
 * is not an adult (lib/age) cannot enter an adultOnly campaign. 403.
 */
export async function assertMayEnterCampaign(
  userId: string,
  campaign: { gmUserId: string; adultOnly?: boolean | null },
  now: Date = new Date(),
): Promise<void> {
  if (!campaign.adultOnly) return;
  if (campaign.gmUserId === userId) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, dateOfBirth: true },
  });
  if (!user || !canEnterAdultCampaign(user, campaign, now)) throw new AdultOnlyError();
}

/**
 * ADMIN clears an AUTO-set 18+ (coordinator ruling 2026-10-12) — e.g. a
 * tone-filter false positive. Refuses while any content still carries
 * `sexual`; dismisses tone-filter notes up to now; records who/when in
 * adultOnlySetBy (`admin:<userId>`) / adultOnlyAt. A watcher-set 18+ is the
 * Watcher's call and is not cleared here.
 */
export async function clearAdultOnly(
  campaignId: string,
  adminUser: { id: string; role: string },
  now: Date = new Date(),
): Promise<{ adultOnly: false; adultOnlySetBy: string }> {
  if (adminUser.role !== 'ADMIN') throw new ForbiddenError('Only ADMIN can clear an 18+ table');
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, adultOnly: true, adultOnlySetBy: true },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!campaign.adultOnly) throw new ConflictError('This table is not 18+');
  if (campaign.adultOnlySetBy === 'watcher') {
    throw new ConflictError("This table was set 18+ by its Watcher — only the Watcher can clear it");
  }
  if (await campaignHasSexualContent(campaignId, { includeNotes: false })) {
    throw new ConflictError('Content in this table still carries the sexual flag — remove the flag first');
  }
  const setBy = `admin:${adminUser.id}`;
  await audit(campaignId, adminUser.id, 'USER', NOTES_CLEARED_ACTION, {});
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { adultOnly: false, adultOnlySetBy: setBy, adultOnlyAt: now },
  });
  await audit(campaignId, adminUser.id, 'USER', 'ADULT_ONLY_CLEARED', { setBy: 'admin' });
  return { adultOnly: false, adultOnlySetBy: setBy };
}
