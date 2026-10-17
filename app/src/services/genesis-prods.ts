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
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { requireCampaignGM } from './campaign-access';
import { updateWorkSession } from './daya-work-session';
import { parseGenesisGoal } from './character-genesis-progress';
import { pickProdForReply } from '@/lib/prod-reply';
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
  /** 'gm' | 'player' | 'player:<characterId>' — who owns the answer (2026-10-16). */
  audience?: string;
}

/** `gm`, `player`, or `player:<characterId>`. */
export const PROD_AUDIENCE_RE = /^(gm|player|player:[A-Za-z0-9_-]{1,64})$/;

/**
 * May this user decide this prod? Pure. The campaign GM and ADMIN decide
 * everything; the character's owner decides prods addressed to 'player';
 * the named character's owner decides 'player:<id>'.
 */
export function mayDecideProd(
  user: { id: string; role: string },
  ctx: { gmUserId: string; audience: string | null | undefined; ownerUserId: string | null; namedOwnerUserId?: string | null },
): boolean {
  if (user.role === 'ADMIN' || user.id === ctx.gmUserId) return true;
  const a = (ctx.audience ?? 'gm').trim();
  if (a === 'player') return !!ctx.ownerUserId && user.id === ctx.ownerUserId;
  if (a.startsWith('player:')) return !!ctx.namedOwnerUserId && user.id === ctx.namedOwnerUserId;
  return false;
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
  /** Who owns the answer (2026-10-16): gm (default) | player | player:<characterId>. */
  audience: z.string().regex(PROD_AUDIENCE_RE, 'audience = gm | player | player:<characterId>').default('gm')
    .describe('gm (story fit, default) | player (her own life — the Trailblazer who plays her) | player:<characterId> (another player\'s character).'),
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
  // player:<id> must name a character of THIS campaign (never her own id —
  // that is plain 'player').
  let audience = p.audience;
  if (audience.startsWith('player:')) {
    const namedId = audience.slice('player:'.length);
    if (namedId === parsed.characterId) audience = 'player';
    else {
      const named = await prisma.character.findUnique({ where: { id: namedId }, select: { campaignId: true } });
      if (!named || named.campaignId !== campaignId) throw new ValidationError(`audience player:${namedId} is not a character of this campaign — use "player" for her own life, "gm" for the world.`);
    }
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
      // The stage the question belongs to (2026-10-16): a completion stage
      // opens with a question round, and the cycle knows one happened by this.
      stage: session.stage ?? null,
      audience,
    },
  });
  if (!prodding) await markBlockedOnProds(session, prod);
  // The chat IS the question, at every stage (Mike 2026-10-12): full text +
  // why, with Answer / Leave open / You decide attached. Since 2026-10-16 the
  // question goes to whoever owns the answer: GM chat, or a notification to
  // the Trailblazer (deliverGenesisProd), plus a needs_input stream event.
  try {
    const { deliverGenesisProd } = await import('./character-genesis-progress');
    await deliverGenesisProd(session, prod);
  } catch (err) {
    console.error('[genesis-prods] prod not delivered:', err);
  }
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

/** GM — or the character's owner (2026-10-16: her prods reach her) — the
 *  prods of a character's latest genesis session. */
export async function getCharacterProds(opts: { campaignId: string; characterId: string; user: User }) {
  try {
    await requireCampaignGM(opts.campaignId, opts.user);
  } catch (err) {
    const owner = await prisma.character.findUnique({ where: { id: opts.characterId }, select: { userId: true, campaignId: true } });
    if (!owner || owner.campaignId !== opts.campaignId || owner.userId !== opts.user.id) throw err;
  }
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
  /** "Fill in the rest" (Mike 2026-10-16): delegates THIS prod and every
   *  other open one, and flips the session to SAIL — no more question
   *  rounds; JEWL builds and notes his assumptions. */
  z.object({ decision: z.literal('SAIL') }),
]);

const DECISION_STATUS: Record<'ANSWER' | 'LEAVE_OPEN' | 'YOU_DECIDE' | 'SAIL', ProdStatus> = {
  ANSWER: 'ANSWERED',
  LEAVE_OPEN: 'LEFT_OPEN',
  YOU_DECIDE: 'DELEGATED',
  SAIL: 'DELEGATED',
};

/** The GM decides one prod — or, since 2026-10-16, the person it was
 *  addressed to (mayDecideProd). A decision can be changed until Build. When
 *  the last OPEN prod is decided, JEWL wakes for a possible follow-up round. */
export async function decideProd(opts: { campaignId: string; prodId: string; user: User; body: unknown }) {
  const campaign = await prisma.campaign.findUnique({ where: { id: opts.campaignId }, select: { id: true, gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  const d = decideSchema.parse(opts.body);
  const prod = await prisma.genesisProd.findUnique({ where: { id: opts.prodId } });
  if (!prod || prod.campaignId !== opts.campaignId) throw new NotFoundError('Prod not found');
  const audience = prod.audience ?? 'gm';
  const owner = await prisma.character.findUnique({ where: { id: prod.characterId }, select: { userId: true } });
  const namedId = audience.startsWith('player:') ? audience.slice('player:'.length) : null;
  const named = namedId ? await prisma.character.findUnique({ where: { id: namedId }, select: { userId: true, campaignId: true } }) : null;
  if (!mayDecideProd(opts.user, {
    gmUserId: campaign.gmUserId,
    audience,
    ownerUserId: owner?.userId ?? null,
    namedOwnerUserId: named && named.campaignId === opts.campaignId ? named.userId : null,
  })) {
    throw new ForbiddenError(audience === 'gm' ? 'Only the campaign GM can do this' : 'Only the campaign GM or the player this question was addressed to can decide it');
  }
  // "Fill in the rest" flips the whole genesis to sail — the GM's call only.
  if (d.decision === 'SAIL' && !(opts.user.role === 'ADMIN' || opts.user.id === campaign.gmUserId)) {
    throw new ForbiddenError('Only the campaign GM can tell JEWL to fill in the rest');
  }
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
  // Its notification (if a player was told) is read now. Best-effort.
  try {
    const { markProdNotificationsRead } = await import('./notifications');
    await markProdNotificationsRead(prod.id);
  } catch { /* the badge re-reads on the next poll */ }
  await logProdNote(session, audience === 'gm' ? 'prod · GM decided' : 'prod · player decided', `${prod.question}\n   → ${
    d.decision === 'ANSWER' ? `answered: ${d.answer}` : d.decision === 'LEAVE_OPEN' ? 'left open (discovered in play)'
      : d.decision === 'SAIL' ? 'fill in the rest (JEWL sails — no more questions this genesis)' : 'you decide (JEWL fills it)'}`);
  if (d.decision === 'SAIL') {
    await prisma.genesisProd.updateMany({
      where: { sessionId: session.id, status: 'OPEN' },
      data: { status: 'DELEGATED', decidedById: opts.user.id, decidedAt: new Date() },
    });
    await prisma.dayaWorkSession.update({ where: { id: session.id }, data: { mode: 'sail' } });
  }

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
  // JEWL acknowledges in one line, in the chat where he asked.
  let ack: string | null = null;
  try {
    const { announceProdDecision } = await import('./character-genesis-progress');
    // Not resumed: say what he is still waiting on, so the wait is never silent (2026-10-17).
    const stillOpen = resumed ? [] : (await prisma.genesisProd.findMany({
      where: { sessionId: session.id, status: 'OPEN' },
      orderBy: [{ round: 'asc' }, { order: 'asc' }],
      select: { question: true },
    })).map(p => p.question);
    ack = await announceProdDecision(session, d.decision, resumed, stillOpen);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[genesis-prods] ack not posted:', err);
  }
  return { prod: updated, resumed, ack };
}

/**
 * The Watcher's plain chat reply while a prod is OPEN IS its answer (Mike
 * 2026-10-12: "Jewl should just ask there in the chat"). The OPEN prod of a
 * live genesis session the reply matches best (pickProdForReply) takes it as
 * ANSWER; the reply never goes on to a normal JEWL turn. Null when nothing is
 * open or the sender is not the campaign GM / ADMIN.
 */
export async function answerOpenProdFromChat(opts: {
  campaignId: string;
  user: User & { username?: string };
  text: string;
}): Promise<{ prodId: string; sessionId: string; resumed: boolean; ack: string | null } | null> {
  const text = opts.text.trim();
  if (!text) return null;
  try {
    await requireCampaignGM(opts.campaignId, opts.user);
  } catch {
    return null;
  }
  const open = await prisma.genesisProd.findMany({
    where: { campaignId: opts.campaignId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  const live: typeof open = [];
  for (const prod of open) {
    const session = await prisma.dayaWorkSession.findUnique({ where: { id: prod.sessionId }, select: { status: true } });
    if (session && session.status !== 'done' && session.status !== 'cancelled') live.push(prod);
  }
  // One session at a time: the newest live session's prods, then the best match among them.
  const sessionId = live[0]?.sessionId;
  const prod = pickProdForReply(live.filter(p => p.sessionId === sessionId), text);
  if (prod) {
    await prisma.copilotMessage.create({
      data: {
        campaignId: opts.campaignId,
        role: 'user',
        content: text,
        userId: opts.user.id,
        username: opts.user.username ?? null,
        actions: JSON.stringify({ source: 'GM_TEXT', answeredProdId: prod.id }),
      },
    });
    const r = await decideProd({ campaignId: opts.campaignId, prodId: prod.id, user: opts.user, body: { decision: 'ANSWER', answer: text } });
    return { prodId: prod.id, sessionId: prod.sessionId, resumed: r.resumed, ack: r.ack };
  }
  return null;
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
