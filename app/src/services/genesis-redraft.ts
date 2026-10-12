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
