/**
 * Genesis REDRAFT — the GM sends a genesis's drafts back (Mike 2026-10-12:
 * "The suggested blocks roots branches etc. are extremely campaign specific.
 * Remember blocks are meant to be campaign agnostic.").
 *
 * withdrawDraftsAndRedraft: every pending JEWL draft of the session is
 * withdrawn through the shared withdraw path (services/forge-withdraw.ts),
 * a cycle note tells JEWL to generalise per the archetype law (the names ride
 * into later cycles as REJECTED SHAPES), and the session is un-blocked so the
 * next cycle redrafts.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { requireCampaignGM } from './campaign-access';
import { updateWorkSession } from './daya-work-session';
import { parseGenesisGoal } from './character-genesis-progress';
import { withdrawForgeDraft } from './forge-withdraw';
import { DRAFTS_WITHDRAWN_PREFIX } from './block-archetype';

interface Actor { id: string; role: string }

/** Genesis session of this campaign, still open, past PRODDING. */
async function loadOpenGenesis(campaignId: string, sessionId: string) {
  const session = await prisma.dayaWorkSession.findUnique({ where: { id: sessionId } });
  if (!session || session.campaignId !== campaignId) throw new NotFoundError('Work session not found');
  const genesis = parseGenesisGoal(session.goal);
  if (!genesis) throw new ValidationError('Not a character genesis session');
  if (session.status === 'done' || session.status === 'cancelled') {
    throw new ValidationError(`Genesis is already ${session.status} — nothing to redraft`);
  }
  if (session.stage === 'PRODDING') throw new ValidationError('Genesis is still in the prod stage — nothing drafted yet');
  return { session, characterId: genesis.characterId };
}

/**
 * The session's pending drafts: JEWL-authored drafts linked to this session or
 * character, plus his unlinked drafts made since the session began (drafts
 * from before the link existed). Drafts linked to ANOTHER character are never
 * swept up (parallel geneses in one campaign).
 */
export async function sessionPendingDrafts(opts: {
  campaignId: string;
  sessionId: string;
  characterId: string;
  startedAt: Date;
  jewlUserId: string;
}) {
  const links = await prisma.characterBlockLink.findMany({
    where: { campaignId: opts.campaignId },
    select: { forgeItemId: true, characterId: true, sessionId: true },
  });
  const mine = new Set(links.filter(l => l.characterId === opts.characterId || l.sessionId === opts.sessionId).map(l => l.forgeItemId));
  const others = new Set(links.filter(l => !mine.has(l.forgeItemId)).map(l => l.forgeItemId));
  const drafts = await prisma.forgeItem.findMany({
    where: {
      campaignId: opts.campaignId,
      status: 'draft',
      authorUserId: opts.jewlUserId,
      OR: [{ id: { in: [...mine] } }, { createdAt: { gte: opts.startedAt } }],
    },
    select: { id: true, name: true, type: true },
    orderBy: { createdAt: 'asc' },
  });
  return drafts.filter(d => mine.has(d.id) || !others.has(d.id));
}

export async function withdrawDraftsAndRedraft(opts: { campaignId: string; sessionId: string; actor: Actor }) {
  await requireCampaignGM(opts.campaignId, opts.actor);
  const { session, characterId } = await loadOpenGenesis(opts.campaignId, opts.sessionId);
  const { getJewlGodHead } = await import('@/ai/copilot/jewl-identity');
  const jewl = await getJewlGodHead();

  const drafts = await sessionPendingDrafts({
    campaignId: opts.campaignId,
    sessionId: session.id,
    characterId,
    startedAt: session.startedAt,
    jewlUserId: jewl.characterUserId,
  });
  const withdrawn: Array<{ id: string; name: string; type: string }> = [];
  for (const d of drafts) {
    withdrawn.push(await withdrawForgeDraft({
      forgeItemId: d.id,
      campaignId: opts.campaignId,
      jewlUserId: jewl.characterUserId,
      reason: 'GM redraft: generalise per the archetype law',
      by: `GM:${opts.actor.id}`,
    }));
  }
  if (withdrawn.length) {
    // Paint on a withdrawn draft is dead — JEWL re-paints the redraft.
    await prisma.characterBlockLink.deleteMany({ where: { forgeItemId: { in: withdrawn.map(w => w.id) } } });
  }

  const list = withdrawn.map(w => `${w.type} "${w.name}"`).join(', ');
  await updateWorkSession({
    sessionId: session.id,
    status: 'active',
    progressNote: withdrawn.length ? `${DRAFTS_WITHDRAWN_PREFIX} — ${list}` : `${DRAFTS_WITHDRAWN_PREFIX} — (no pending drafts)`,
  });
  const { kickWorkLoop } = await import('@/ai/copilot/work-loop');
  kickWorkLoop();
  return { sessionId: session.id, status: 'active' as const, withdrawn };
}

// ── Per-draft GM feedback (Mike 2026-10-12: "there should be options for
// feedback for each one in case they want to change a seed or branch etc.") ──

export const FEEDBACK_NOTE_MAX = 600;
export const feedbackSchema = z.object({ note: z.string().trim().min(1).max(FEEDBACK_NOTE_MAX) });
export const FEEDBACK_PREFIX = 'GM feedback on';

/** The cycle note a revision request leaves (carried verbatim into cycles). Pure. */
export function feedbackNote(name: string, type: string, note: string, seedHasMemories = false): string {
  const seed = type === 'seed'
    ? (seedHasMemories
      ? ' (seed: you may re-pick it — pull a different stock seed or redraft; memories already exist, so the sheet may need a rebuild)'
      : ' (seed: you may re-pick it — pull a different stock seed or redraft)')
    : '';
  return `${FEEDBACK_PREFIX} ${name} (${type}): ${note} — redraft it${seed}`;
}

/**
 * The GM sends ONE draft back with a note: that draft alone is withdrawn
 * (shared withdraw path; the note rides on its withdrawn tag as
 * `revisionNote`), the note lands in the genesis session's cycle notes, and
 * the session resumes so the next cycle redrafts just that one. Seed drafts
 * route here too — JEWL may re-pick the seed.
 */
export async function requestDraftRevision(opts: { campaignId: string; draftId: string; body: unknown; actor: Actor }) {
  await requireCampaignGM(opts.campaignId, opts.actor);
  const { note } = feedbackSchema.parse(opts.body ?? {});
  const { getJewlGodHead } = await import('@/ai/copilot/jewl-identity');
  const jewl = await getJewlGodHead();

  const draft = await prisma.forgeItem.findUnique({
    where: { id: opts.draftId },
    select: { id: true, name: true, type: true, status: true, campaignId: true, authorUserId: true, createdAt: true },
  });
  if (!draft || draft.campaignId !== opts.campaignId) throw new NotFoundError('Draft not found');
  if (draft.status !== 'draft') throw new ValidationError(`Only drafts take feedback (this one is '${draft.status}')`);
  if (draft.authorUserId !== jewl.characterUserId) throw new ValidationError('Feedback goes to JEWL\'s drafts — edit your own in the Forge');

  // Which genesis is this draft part of? Its link first, else the newest open
  // genesis in the campaign that began before it was drafted.
  const link = await prisma.characterBlockLink.findFirst({
    where: { forgeItemId: draft.id },
    select: { characterId: true, sessionId: true },
  });
  const session = link?.sessionId
    ? await prisma.dayaWorkSession.findUnique({ where: { id: link.sessionId } })
    : await prisma.dayaWorkSession.findFirst({
        where: {
          campaignId: opts.campaignId,
          status: { in: ['active', 'blocked'] },
          AND: [
            { goal: { startsWith: 'Character genesis' } },
            ...(link?.characterId ? [{ goal: { contains: `[${link.characterId}]` } }] : []),
          ],
          startedAt: { lte: draft.createdAt },
        },
        orderBy: { startedAt: 'desc' },
      });
  if (!session || session.campaignId !== opts.campaignId) throw new NotFoundError('No genesis session for this draft');
  if (session.status === 'done' || session.status === 'cancelled') {
    throw new ValidationError(`Genesis is already ${session.status} — revise the block in the Forge`);
  }
  const genesis = parseGenesisGoal(session.goal);

  const draftName = draft.name; // before the withdraw renames the row
  await withdrawForgeDraft({
    forgeItemId: draft.id,
    campaignId: opts.campaignId,
    jewlUserId: jewl.characterUserId,
    reason: `GM feedback: ${note}`,
    by: `GM:${opts.actor.id}`,
    tag: { revisionNote: note, sessionId: session.id },
  });
  await prisma.characterBlockLink.deleteMany({ where: { forgeItemId: draft.id } });

  let seedHasMemories = false;
  if (draft.type === 'seed' && genesis) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: genesis.characterId }, select: { id: true } });
    seedHasMemories = entity ? (await prisma.dayaMemoryEntry.count({ where: { entityId: entity.id } })) > 0 : false;
  }
  const progressNote = feedbackNote(draftName, draft.type, note, seedHasMemories);
  await updateWorkSession({ sessionId: session.id, status: 'active', progressNote });
  const { kickWorkLoop } = await import('@/ai/copilot/work-loop');
  kickWorkLoop();
  return { draftId: draft.id, name: draftName, type: draft.type, sessionId: session.id, status: 'revising' as const, seedHasMemories };
}

/** One withdrawn-with-feedback row and the drafts JEWL made since (pure input). */
export interface RevisionRow { id: string; type: string; name: string; note: string; at: string }

/**
 * Feedback still waiting on a redraft: a revision is pending until JEWL has
 * drafted a new block of the same type after the feedback was given. Pure.
 */
export function pendingRevisions(revisions: RevisionRow[], laterDrafts: Array<{ type: string; createdAt: Date | string }>): RevisionRow[] {
  return revisions.filter(r => !laterDrafts.some(d => d.type === r.type && new Date(d.createdAt).getTime() > Date.parse(r.at)));
}

/** The session's pending GM feedback, as cycle lines (newest last). */
export async function loadPendingFeedback(campaignId: string, sessionId: string, jewlUserId: string): Promise<string[]> {
  const rows = await prisma.forgeItem.findMany({
    where: { campaignId, status: 'superseded', relationshipTags: { contains: '"revisionNote"' } },
    select: { relationshipTags: true },
  });
  const revisions: RevisionRow[] = [];
  for (const r of rows) {
    try {
      const w = (JSON.parse(r.relationshipTags ?? '{}') as { withdrawn?: Record<string, unknown> }).withdrawn;
      if (w && w.sessionId === sessionId && typeof w.revisionNote === 'string') {
        revisions.push({ id: '', type: String(w.type ?? ''), name: String(w.originalName ?? ''), note: w.revisionNote, at: String(w.at ?? '') });
      }
    } catch { /* malformed tag */ }
  }
  if (!revisions.length) return [];
  const since = new Date(Math.min(...revisions.map(r => Date.parse(r.at))));
  const later = await prisma.forgeItem.findMany({
    where: { campaignId, authorUserId: jewlUserId, createdAt: { gt: since }, status: { not: 'superseded' } },
    select: { type: true, createdAt: true },
  });
  return pendingRevisions(revisions, later)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map(r => feedbackNote(r.name, r.type, r.note));
}
