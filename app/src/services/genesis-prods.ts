/**
 * Genesis PRODS — genesis is a dialogue (Mike 2026-10-12,
 * [[ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12]]).
 *
 * Before JEWL builds anything, the genesis session sits in stage PRODDING:
 * JEWL reads the seed and raises PRODS — questions about the creative gaps
 * that are load-bearing (who, why, what happened, what it means), each
 * anchored to the passage that raised it. The GM answers each one, leaves it
 * open (a mystery to be discovered in play — JEWL must never fill it) or says
 * "you decide" (JEWL fills it and records his choice). Rounds continue until
 * the GM presses Build; ONLY Build moves the session past PRODDING.
 *
 * GM = storyteller; JEWL = production crew, not a co-author
 * ([[jewl-is-the-interface-2026-06-15]]).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { requireCampaignGM } from './campaign-access';
import { updateWorkSession } from './daya-work-session';
import { parseGenesisGoal } from './character-genesis-progress';
import { PRODS_BLOCKED_REASON, isProdsBlocked, prodsBlockedReason } from '@/lib/genesis-question';

export const PRODDING_STAGE = 'PRODDING';
export const BUILDING_STAGE = 'BUILDING';
export const PRODS_PER_ROUND = 5;
export const ANCHOR_MAX = 300;

export const PROD_KINDS = ['CREATIVE', 'MECHANICAL_CHECK'] as const;
export type ProdKind = (typeof PROD_KINDS)[number];
export type ProdStatus = 'OPEN' | 'ANSWERED' | 'LEFT_OPEN' | 'DELEGATED';

/** Fixed prefix of the blocked reason while the GM holds the prods. */
export { PRODS_BLOCKED_REASON };

export interface GenesisProdRow {
  id: string;
  sessionId: string;
  campaignId: string;
  characterId: string;
  round: number;
  order: number;
  anchorQuote: string;
  question: string;
  why: string;
  kind: string;
  status: string;
  answer: string | null;
  jewlFill: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}

function clip(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

async function loadSession(sessionId: string, campaignId: string) {
  const session = await prisma.dayaWorkSession.findUnique({ where: { id: sessionId } });
  if (!session || session.campaignId !== campaignId) throw new NotFoundError('Work session not found');
  return session;
}

function requireOpenSession(session: { status: string }) {
  if (session.status === 'done' || session.status === 'cancelled') {
    throw new ValidationError(`Work session is already ${session.status}`);
  }
}

function requireProdding(session: { stage: string | null; status: string }) {
  if (session.stage !== PRODDING_STAGE) {
    throw new ValidationError('This session is not in the prod stage — the GM already pressed Build (or it is not a genesis).');
  }
  if (session.status === 'done' || session.status === 'cancelled') {
    throw new ValidationError(`Work session is already ${session.status}`);
  }
}

/** Every prod of a session, round then order. No permission check — callers gate. */
export async function listSessionProds(sessionId: string): Promise<GenesisProdRow[]> {
  return prisma.genesisProd.findMany({
    where: { sessionId },
    orderBy: [{ round: 'asc' }, { order: 'asc' }],
  });
}

// ── JEWL's side (tools) ─────────────────────────────────────────────────

export const raiseProdSchema = z.object({
  sessionId: z.string().min(1),
  anchorQuote: z.string().min(1).max(2000),
  question: z.string().min(5).max(600),
  why: z.string().min(3).max(300),
  kind: z.enum(PROD_KINDS),
});

/** JEWL raises one prod — at ANY genesis stage (2026-10-12: "Never should I
 *  have to go to the logs to answer a question jewl has"). Opens a new round
 *  on the first prod after a closed one; refuses a sixth in the same round.
 *  Outside PRODDING the session stays in its stage and is marked
 *  blocked-on-prod (open prod ids in the blocked reason); it resumes when the
 *  GM has decided every open prod — no Build. Each mid-build prod posts its
 *  question to the GM's chat. */
export async function raiseProd(input: unknown, campaignId: string): Promise<GenesisProdRow> {
  const p = raiseProdSchema.parse(input);
  const session = await loadSession(p.sessionId, campaignId);
  requireOpenSession(session);
  const parsed = parseGenesisGoal(session.goal);
  if (!parsed) throw new ValidationError('Prods belong to a character genesis session.');

  let round = session.prodRound;
  if (round === 0) {
    const last = await prisma.genesisProd.findFirst({
      where: { sessionId: session.id },
      orderBy: { round: 'desc' },
      select: { round: true },
    });
    round = (last?.round ?? 0) + 1;
    await prisma.dayaWorkSession.update({ where: { id: session.id }, data: { prodRound: round } });
  }
  const inRound = await prisma.genesisProd.count({ where: { sessionId: session.id, round } });
  const prodding = session.stage === PRODDING_STAGE;
  if (inRound >= PRODS_PER_ROUND) {
    throw new ValidationError(prodding
      ? `Round ${round} already holds ${PRODS_PER_ROUND} prods — the most load-bearing ones. Call end_prod_round.`
      : `${PRODS_PER_ROUND} prods already wait on the GM — no more until he answers. Assume what you can and note it.`);
  }
  const prod = await prisma.genesisProd.create({
    data: {
      sessionId: session.id,
      campaignId,
      characterId: parsed.characterId,
      round,
      order: inRound + 1,
      anchorQuote: clip(p.anchorQuote, ANCHOR_MAX),
      question: p.question.trim(),
      why: clip(p.why, 300),
      kind: p.kind,
    },
  });
  if (!prodding) await markBlockedOnProds(session, prod);
  return prod;
}

/** Mid-build prod: hold the session (its stage unchanged) until the GM has
 *  decided every OPEN prod, and put the question in his chat. A wait for
 *  something else (Forge approvals) is superseded — JEWL re-blocks on it
 *  after he resumes if it still holds. */
async function markBlockedOnProds(
  session: { id: string; campaignId: string; goal: string; status: string; blockedReason: string | null },
  prod: GenesisProdRow,
) {
  const openIds = (await prisma.genesisProd.findMany({
    where: { sessionId: session.id, status: 'OPEN' },
    orderBy: [{ round: 'asc' }, { order: 'asc' }],
    select: { id: true },
  })).map(r => r.id);
  const reason = prodsBlockedReason(openIds);
  if (session.status === 'blocked') {
    // Already waiting (on prods, or on something prods now supersede).
    await prisma.dayaWorkSession.update({ where: { id: session.id }, data: { blockedReason: reason } });
  } else {
    await updateWorkSession({
      sessionId: session.id,
      status: 'blocked',
      blockedReason: reason,
      progressNote: `[prods] mid-build question raised — waiting on the GM (${openIds.length} open)`,
    });
  }
  await logProdNote(session, `prod · mid-build r${prod.round}.${prod.order}`,
    `[${prod.kind}] ${prod.question}\n   ↳ "${prod.anchorQuote}"\n   hinges on: ${prod.why}`);
  try {
    const { announceGenesisProd } = await import('./character-genesis-progress');
    await announceGenesisProd(session, prod);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[genesis-prods] chat line not posted:', err);
  }
}

export const endProdRoundSchema = z.object({
  sessionId: z.string().min(1),
  note: z.string().max(500).optional(),
});

/** JEWL closes the round he is raising and waits on the GM (answers or
 *  Build). Never moves the stage: only Build does. */
export async function endProdRound(input: unknown, campaignId: string) {
  const p = endProdRoundSchema.parse(input);
  const session = await loadSession(p.sessionId, campaignId);
  requireProdding(session);
  const round = session.prodRound;
  const raised = round > 0 ? await prisma.genesisProd.count({ where: { sessionId: session.id, round } }) : 0;
  await prisma.dayaWorkSession.update({ where: { id: session.id }, data: { prodRound: 0 } });
  const open = await prisma.genesisProd.count({ where: { sessionId: session.id, status: 'OPEN' } });

  await updateWorkSession({
    sessionId: session.id,
    status: 'blocked',
    blockedReason: PRODS_BLOCKED_REASON,
    progressNote: raised > 0
      ? `[prods] round ${round}: ${raised} raised${p.note ? ` — ${clip(p.note, 200)}` : ''}`
      : `[prods] nothing more to ask${p.note ? ` — ${clip(p.note, 200)}` : ''}`,
  });

  if (raised > 0) {
    const prods = await prisma.genesisProd.findMany({ where: { sessionId: session.id, round }, orderBy: { order: 'asc' } });
    await logProdNote(session, `prods · round ${round}`, prods.map(pr =>
      `${pr.order}. [${pr.kind}] ${pr.question}\n   ↳ "${pr.anchorQuote}"\n   hinges on: ${pr.why}`).join('\n'));
  }
  return { round: raised > 0 ? round : null, raised, open };
}

export const recordDelegatedChoiceSchema = z.object({
  prodId: z.string().min(1),
  choice: z.string().min(1).max(1000),
});

/** JEWL writes back what he chose for a prod the GM delegated. */
export async function recordDelegatedChoice(input: unknown, campaignId: string): Promise<GenesisProdRow> {
  const p = recordDelegatedChoiceSchema.parse(input);
  const prod = await prisma.genesisProd.findUnique({ where: { id: p.prodId } });
  if (!prod || prod.campaignId !== campaignId) throw new NotFoundError('Prod not found');
  if (prod.status !== 'DELEGATED') {
    throw new ValidationError(prod.status === 'LEFT_OPEN'
      ? 'The GM left this one OPEN — it is a mystery for play. Never fill it.'
      : 'Only a prod the GM delegated ("you decide") takes your choice.');
  }
  const updated = await prisma.genesisProd.update({ where: { id: prod.id }, data: { jewlFill: p.choice.trim() } });
  const session = await prisma.dayaWorkSession.findUnique({ where: { id: prod.sessionId } });
  if (session) await logProdNote(session, 'prod · JEWL decided', `${prod.question}\n   → ${updated.jewlFill}`);
  return updated;
}

// ── The GM's side (routes) ──────────────────────────────────────────────

type User = { id: string; role: string };

/** GM: the prods of a character's latest genesis session. */
export async function getCharacterProds(opts: { campaignId: string; characterId: string; user: User }) {
  await requireCampaignGM(opts.campaignId, opts.user);
  const session = await prisma.dayaWorkSession.findFirst({
    where: { campaignId: opts.campaignId, goal: { contains: `[${opts.characterId}]` } },
    orderBy: { startedAt: 'desc' },
    select: { id: true, stage: true, status: true },
  });
  if (!session) return { sessionId: null, stage: null, prods: [] as GenesisProdRow[] };
  return { sessionId: session.id, stage: session.stage, prods: await listSessionProds(session.id) };
}

export const decideSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('ANSWER'), answer: z.string().trim().min(1, 'Write an answer, or leave it open.').max(4000) }),
  z.object({ decision: z.literal('LEAVE_OPEN') }),
  z.object({ decision: z.literal('YOU_DECIDE') }),
]);

const DECISION_STATUS: Record<'ANSWER' | 'LEAVE_OPEN' | 'YOU_DECIDE', ProdStatus> = {
  ANSWER: 'ANSWERED',
  LEAVE_OPEN: 'LEFT_OPEN',
  YOU_DECIDE: 'DELEGATED',
};

/** GM decides one prod. A decision can be changed until Build. When the last
 *  OPEN prod is decided, JEWL wakes for a possible follow-up round. */
export async function decideProd(opts: { campaignId: string; prodId: string; user: User; body: unknown }) {
  await requireCampaignGM(opts.campaignId, opts.user);
  const d = decideSchema.parse(opts.body);
  const prod = await prisma.genesisProd.findUnique({ where: { id: opts.prodId } });
  if (!prod || prod.campaignId !== opts.campaignId) throw new NotFoundError('Prod not found');
  const session = await prisma.dayaWorkSession.findUnique({ where: { id: prod.sessionId } });
  if (!session) throw new NotFoundError('Work session not found');
  requireOpenSession(session);

  const wasOpen = prod.status === 'OPEN';
  const updated = await prisma.genesisProd.update({
    where: { id: prod.id },
    data: {
      status: DECISION_STATUS[d.decision],
      answer: d.decision === 'ANSWER' ? d.answer : null,
      jewlFill: null,
      decidedById: opts.user.id,
      decidedAt: new Date(),
    },
  });
  await logProdNote(session, 'prod · GM decided', `${prod.question}\n   → ${
    d.decision === 'ANSWER' ? `answered: ${d.answer}` : d.decision === 'LEAVE_OPEN' ? 'left open (discovered in play)' : 'you decide (JEWL fills it)'}`);

  let resumed = false;
  if (wasOpen && session.stage !== PRODDING_STAGE) {
    // Mid-build prod: the session resumes the moment every OPEN prod is
    // decided — no Build. Until then the reason keeps the open ids current.
    const openIds = (await prisma.genesisProd.findMany({
      where: { sessionId: session.id, status: 'OPEN' },
      orderBy: [{ round: 'asc' }, { order: 'asc' }],
      select: { id: true },
    })).map(r => r.id);
    if (session.status === 'blocked' && isProdsBlocked(session.blockedReason)) {
      if (openIds.length === 0) {
        await prisma.dayaWorkSession.update({ where: { id: session.id }, data: { prodRound: 0 } });
        await updateWorkSession({
          sessionId: session.id,
          status: 'active',
          progressNote: '[prods] the GM decided every mid-build prod — resuming',
        });
        const { kickWorkLoop } = await import('@/ai/copilot/work-loop');
        kickWorkLoop();
        resumed = true;
      } else {
        await prisma.dayaWorkSession.update({ where: { id: session.id }, data: { blockedReason: prodsBlockedReason(openIds) } });
      }
    }
  } else if (wasOpen) {
    const open = await prisma.genesisProd.count({ where: { sessionId: session.id, status: 'OPEN' } });
    // Round answered and JEWL is waiting (not mid-round) → one follow-up cycle.
    if (open === 0 && session.status === 'blocked' && session.prodRound === 0) {
      await updateWorkSession({
        sessionId: session.id,
        status: 'active',
        progressNote: '[prods] the GM decided every prod — follow-up round allowed',
      });
      const { kickWorkLoop } = await import('@/ai/copilot/work-loop');
      kickWorkLoop();
      resumed = true;
    }
  }
  return { prod: updated, resumed };
}

export const buildSchema = z.object({ confirmLeaveOpen: z.boolean().optional() });

/** GM presses Build: OPEN prods become LEFT_OPEN (confirmed), the session
 *  leaves PRODDING and the normal pipeline resumes. The ONLY way out of PRODDING. */
export async function buildGenesis(opts: { campaignId: string; sessionId: string; user: User; body: unknown }) {
  await requireCampaignGM(opts.campaignId, opts.user);
  const b = buildSchema.parse(opts.body ?? {});
  const session = await loadSession(opts.sessionId, opts.campaignId);
  requireProdding(session);

  const open = await prisma.genesisProd.count({ where: { sessionId: session.id, status: 'OPEN' } });
  if (open > 0 && !b.confirmLeaveOpen) {
    throw new ValidationError(`${open} unanswered prod${open === 1 ? '' : 's'} will be left open — confirm to build.`);
  }
  const now = new Date();
  const leftOpen = open > 0
    ? (await prisma.genesisProd.updateMany({
        where: { sessionId: session.id, status: 'OPEN' },
        data: { status: 'LEFT_OPEN', decidedById: opts.user.id, decidedAt: now },
      })).count
    : 0;
  await prisma.dayaWorkSession.update({
    where: { id: session.id },
    data: { stage: BUILDING_STAGE, prodRound: 0 },
  });
  await updateWorkSession({
    sessionId: session.id,
    status: 'active',
    progressNote: `[prods] the GM pressed Build${leftOpen ? ` — ${leftOpen} left open` : ''}; gestating`,
  });
  await logProdNote(session, 'prods · Build', leftOpen
    ? `The GM pressed Build. ${leftOpen} unanswered prod${leftOpen === 1 ? '' : 's'} left open — mysteries for play.`
    : 'The GM pressed Build.');
  const { kickWorkLoop } = await import('@/ai/copilot/work-loop');
  kickWorkLoop();
  return { sessionId: session.id, stage: BUILDING_STAGE, leftOpen };
}

// ── Log (jEWL Log → Genesis filter) ─────────────────────────────────────

async function logProdNote(session: { campaignId: string; goal: string }, heading: string, text: string) {
  try {
    const { getJewlGodHead } = await import('@/ai/copilot/jewl-identity');
    const { logGenesisReport } = await import('./character-genesis-progress');
    const jewl = await getJewlGodHead();
    await logGenesisReport({ campaignId: session.campaignId, goal: session.goal, message: text, heading, jewlUserId: jewl.characterUserId });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[genesis-prods] log row not written:', err);
  }
}
