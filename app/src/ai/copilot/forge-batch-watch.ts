/**
 * Forge batch watch — the "watch and wait" leg of the authoring flow
 * (Mike 2026-08-04): JEWL batch-drafts item blueprints, tells the GM to
 * review them in the Forge, and must follow up once ALL of his pending
 * drafts are handled — clarifying anything denied or changed.
 *
 * Deterministic, no polling: the Forge publish/delete routes call this
 * after each resolution. When the resolved draft was JEWL-authored and
 * none of his drafts remain pending, a system prompt wakes him with the
 * final published state; his reply reaches the GM via the chip's
 * burst-through.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { resumeBlockedWorkSessions } from '@/services/daya-work-session';
import { getJewlGodHead } from './jewl-identity';
import { dispatchPrompt } from './runtime';
import { kickWorkLoop } from './work-loop';

export async function maybeNotifyJewlForgeBatchResolved(
  campaignId: string,
  resolvedItem: { name: string; createdBy: string },
  resolution: 'published' | 'deleted',
): Promise<void> {
  try {
    const jewl = await getJewlGodHead();
    // Only JEWL's own drafts participate in the watch.
    if (resolvedItem.createdBy !== jewl.characterUserId) return;
    const pending = await prisma.forgeItem.count({
      where: { campaignId, status: 'draft', createdBy: jewl.characterUserId },
    });
    if (pending > 0) return; // batch not fully handled yet — keep waiting

    // F-3: approvals were the blocker — put blocked work sessions back to
    // work before the wake prompt, so his follow-up runs with them live.
    const resumed = await resumeBlockedWorkSessions(campaignId);
    if (resumed > 0) kickWorkLoop();
    const published = await prisma.forgeItem.findMany({
      where: {
        campaignId,
        createdBy: jewl.characterUserId,
        status: { in: ['published', 'global'] },
      },
      select: { id: true, name: true, type: true, data: true },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    });
    const publishedSummary = JSON.stringify(
      published.map(p => {
        let data: unknown = {};
        try { data = JSON.parse(p.data); } catch { /* raw */ }
        return { name: p.name, type: p.type, data };
      }),
    ).slice(0, 6000);
    void dispatchPrompt({
      source: 'JEWL_AUTONOMOUS_TICK',
      campaignId,
      actorId: jewl.characterUserId,
      actorName: 'JEWL',
      actorRole: 'GODHEAD',
      text:
        `[SYSTEM] Forge watch: the GM ${resolution} "${resolvedItem.name}" and NO drafts you authored remain pending in this campaign — the review batch is fully handled. ` +
        `Your published blueprints now: ${publishedSummary}. ` +
        `Compare against what you proposed. Follow up with the GM: acknowledge what went through, ask about anything DENIED (missing from the list) or CHANGED (edited fields) — clarify what they want differently, never guess. ` +
        `Then continue the build: instantiate approved item designs into their rooms with place_item fromForgeItem.`,
    }).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[forge-batch-watch] dispatch failed:', err);
    });
  } catch (err) {
    // Watching is best-effort — never break the publish/delete itself.
    // eslint-disable-next-line no-console
    console.error('[forge-batch-watch] failed:', err);
  }
}
