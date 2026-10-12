/**
 * Withdraw a JEWL-authored Forge draft — the shared path behind the
 * withdraw_draft tool and the GM's redraft (genesis-redraft.ts). Drafts only,
 * this campaign only, JEWL's authorship only. Withdrawn rows keep their data
 * (status='superseded') — training corpus, not garbage — and free their name
 * slot (@@unique includes name).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';

export async function withdrawForgeDraft(opts: {
  forgeItemId: string;
  campaignId: string;
  jewlUserId: string;
  reason?: string | null;
  by: string;
  /** Extra audit fields on the withdrawn tag (GM feedback: revisionNote, sessionId). */
  tag?: Record<string, unknown>;
}) {
  const item = await prisma.forgeItem.findUnique({
    where: { id: opts.forgeItemId },
    select: { id: true, name: true, type: true, status: true, campaignId: true, authorUserId: true },
  });
  if (!item) throw new NotFoundError(`Forge item ${opts.forgeItemId}`);
  if (item.campaignId !== opts.campaignId) {
    throw new ValidationError('Draft belongs to a different campaign — cannot withdraw.');
  }
  if (item.status !== 'draft') {
    throw new ValidationError(`Only drafts can be withdrawn (this item is '${item.status}').`);
  }
  if (item.authorUserId !== opts.jewlUserId) {
    throw new ValidationError('You can only withdraw drafts you authored.');
  }
  const original = { id: item.id, name: item.name, type: item.type };
  await prisma.forgeItem.update({
    where: { id: item.id },
    data: {
      status: 'superseded',
      name: `${item.name} [w:${item.id.slice(-4)}]`,
      relationshipTags: JSON.stringify({
        withdrawn: {
          by: opts.by,
          reason: opts.reason ?? null,
          at: new Date().toISOString(),
          originalName: item.name,
          type: item.type,
          ...(opts.tag ?? {}),
        },
      }),
    },
  });
  return { ...original, status: 'superseded' as const };
}
