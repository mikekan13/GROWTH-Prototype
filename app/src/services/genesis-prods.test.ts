/** Genesis is a dialogue (2026-10-12): JEWL prods the GM before building; only Build leaves PRODDING. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, ValidationError } from '@/lib/errors';

type Row = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({
  sessions: [] as Array<Record<string, unknown> & { id: string }>,
  prods: [] as Array<Record<string, unknown> & { id: string }>,
  seq: 0,
  kicks: 0,
  logs: [] as Array<Record<string, unknown>>,
  chat: [] as Array<{ sessionId: string; prodId: string; question: string; audience?: string }>,
  acks: [] as Array<{ d: string; resumed: boolean }>,
  userMsgs: [] as Array<Record<string, unknown>>,
}));

function match(row: Row, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}
function apply(row: Row, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) row[k] = v;
  return row;
}

vi.mock('@/lib/db', () => ({
  prisma: {
    copilotMessage: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.userMsgs.push(data); return { id: 'm' }; }),
    },
    campaign: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : where.id === 'c2' ? { id: 'c2', gmUserId: 'gm2' } : null)),
    },
    // ch1 = Violet (owned by player 'pl'); ch2 = Kai (owned by 'pl2'); npc1 = the GM's NPC; other = another campaign's.
    character: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        ch1: { id: 'ch1', userId: 'pl', campaignId: 'c1' },
        ch2: { id: 'ch2', userId: 'pl2', campaignId: 'c1' },
        npc1: { id: 'npc1', userId: 'gm', campaignId: 'c1' },
        other: { id: 'other', userId: 'px', campaignId: 'c2' },
      } as Record<string, unknown>)[where.id] ?? null),
    },
    userNotification: {
      findMany: vi.fn(async () => []),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    dayaWorkSession: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.sessions.find(s => s.id === where.id) ?? null),
      findFirst: vi.fn(async () => db.sessions[0] ?? null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        apply(db.sessions.find(s => s.id === where.id)!, data)),
    },
    genesisProd: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        [...db.prods].filter(p => match(p, where)).sort((a, b) => (b.round as number) - (a.round as number))[0] ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.prods.find(p => p.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        db.prods.filter(p => match(p, where)).sort((a, b) =>
          ((a.round as number) - (b.round as number)) || ((a.order as number) - (b.order as number)))),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => db.prods.filter(p => match(p, where)).length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `p${++db.seq}`, status: 'OPEN', answer: null, jewlFill: null, decidedById: null, decidedAt: null, createdAt: new Date(), ...data };
        db.prods.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        apply(db.prods.find(p => p.id === where.id)!, data)),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const rows = db.prods.filter(p => match(p, where));
        rows.forEach(r => apply(r, data));
        return { count: rows.length };
      }),
    },
  },
}));
vi.mock('@/services/maturity', () => ({ assertMayEnterCampaign: vi.fn(), REMOVED_STATUS: 'REMOVED' }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/ai/copilot/work-loop', () => ({ kickWorkLoop: vi.fn(() => { db.kicks++; }) }));
vi.mock('@/ai/copilot/jewl-identity', () => ({ getJewlGodHead: vi.fn(async () => ({ characterUserId: 'jewl' })) }));
vi.mock('./character-genesis-progress', () => ({
  parseGenesisGoal: (goal: string) => {
    const m = /^Character genesis: (.+?) \[([^\]\s]+)\]/.exec(goal);
    return m ? { name: m[1], characterId: m[2] } : null;
  },
  announceGenesisStatus: vi.fn(async () => null),
  announceGenesisProd: vi.fn(async (s: { id: string }, p: { id: string; question: string }) => {
    db.chat.push({ sessionId: s.id, prodId: p.id, question: p.question });
    return 'line';
  }),
  // Routing (gm chat vs player notification) is tested in genesis-prod-delivery.test.ts.
  deliverGenesisProd: vi.fn(async (s: { id: string }, p: { id: string; question: string; audience?: string }) => {
    db.chat.push({ sessionId: s.id, prodId: p.id, question: p.question, ...(p.audience ? { audience: p.audience } : {}) });
    return { channel: 'chat', userId: 'gm' };
  }),
  announceProdDecision: vi.fn(async (_s: unknown, d: string, resumed: boolean) => { db.acks.push({ d, resumed }); return `ack ${d}`; }),
  logGenesisReport: vi.fn(async (o: Record<string, unknown>) => { db.logs.push(o); return 'ev'; }),
}));

const svc = await import('./genesis-prods');
const { updateWorkSession } = await import('./daya-work-session');
const { buildProdSections, SETTLED_HEADER, OPEN_THREADS_HEADER, DELEGATED_HEADER } = await import('./character-genesis-plan');
const { buildProdCycleText, planWorkCycle, PROD_STAGE_TOOLS, PROD_LAW } = await import('@/ai/copilot/work-cycle-text');

const GM = { id: 'gm', role: 'WATCHER' };
const raise = (n = 1, extra: Record<string, unknown> = {}) => svc.raiseProd({
  sessionId: 's1', anchorQuote: `She left the mill the night of the fire (${n}).`,
  question: `Who set the fire? (${n})`, why: 'Her guilt thorn hinges on it.', kind: 'CREATIVE', ...extra,
}, 'c1');
const session = () => db.sessions[0];

beforeEach(() => {
  db.sessions = [{
    id: 's1', campaignId: 'c1', status: 'active', stage: 'PRODDING', prodRound: 0,
    goal: 'Character genesis: Violet [ch1] — gestate the person', plan: 'GENESIS BRIEF — Violet',
    progress: '[]', blockedReason: null, cycleCount: 1,
  }];
  db.prods = [];
  db.seq = 0;
  db.kicks = 0;
  db.logs = [];
  db.chat = [];
  db.acks = [];
  db.userMsgs = [];
});

describe('raise_prod', () => {
  it('writes rows with round/order and caps a round at 5', async () => {
    for (let i = 1; i <= 5; i++) await raise(i);
    expect(db.prods.map(p => [p.round, p.order])).toEqual([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]]);
    expect(db.prods[0]).toMatchObject({ characterId: 'ch1', campaignId: 'c1', status: 'OPEN', kind: 'CREATIVE' });
    await expect(raise(6)).rejects.toBeInstanceOf(ValidationError);
    expect(db.prods).toHaveLength(5);
  });

  it('a closed round opens the next one at order 1', async () => {
    await raise(1);
    await svc.endProdRound({ sessionId: 's1' }, 'c1');
    for (const p of db.prods) p.status = 'ANSWERED';
    session().status = 'active';
    await raise(2);
    expect(db.prods[1]).toMatchObject({ round: 2, order: 1 });
  });

  it('clips the anchor quote to 300 chars', async () => {
    await raise(1, { anchorQuote: 'x'.repeat(900) });
    expect((db.prods[0].anchorQuote as string).length).toBeLessThanOrEqual(svc.ANCHOR_MAX);
  });

  it('is refused once the session is done or cancelled', async () => {
    session().status = 'done';
    await expect(raise(1)).rejects.toThrow(/already done/);
  });
});

describe('the loop never leaves PRODDING without Build', () => {
  it('end_prod_round waits on the GM and keeps the stage', async () => {
    await raise(1);
    const r = await svc.endProdRound({ sessionId: 's1', note: 'one question' }, 'c1');
    expect(r).toMatchObject({ round: 1, raised: 1, open: 1 });
    expect(session()).toMatchObject({ stage: 'PRODDING', status: 'blocked', prodRound: 0, blockedReason: svc.PRODS_BLOCKED_REASON });
    expect(db.logs.some(l => String(l.heading).includes('round 1'))).toBe(true);
  });

  it('JEWL cannot close a PRODDING session', async () => {
    await expect(updateWorkSession({ sessionId: 's1', status: 'done' })).rejects.toThrow(/prod stage/);
    expect(session().status).toBe('active');
  });

  it('deciding every prod wakes JEWL for a follow-up round — still PRODDING', async () => {
    await raise(1);
    await svc.endProdRound({ sessionId: 's1' }, 'c1');
    const { resumed } = await svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: GM, body: { decision: 'ANSWER', answer: 'Her brother.' } });
    expect(resumed).toBe(true);
    expect(session()).toMatchObject({ stage: 'PRODDING', status: 'active' });
    expect(db.kicks).toBe(1);
  });

  it('a PRODDING cycle offers only the prod tools and carries the law', () => {
    const plan = planWorkCycle({ ...session(), id: 's1', goal: 'g', plan: 'SEED', cycleCount: 0, stage: 'PRODDING' }, [], '', []);
    expect(plan.allowedTools).toEqual([...PROD_STAGE_TOOLS]);
    expect(plan.allowedTools).not.toContain('daya_seed_memory');
    expect(plan.text).toContain('STAGE: PRODDING');
    const built = planWorkCycle({ id: 's1', goal: 'g', plan: 'SEED', cycleCount: 0, stage: 'BUILDING' }, [], '', []);
    expect(built.allowedTools).toBeUndefined();
  });
});

describe('the GM decides (perms)', () => {
  beforeEach(async () => { await raise(1); });

  it('a Trailblazer gets 403', async () => {
    await expect(svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: { id: 'tb', role: 'TRAILBLAZER' }, body: { decision: 'LEAVE_OPEN' } }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it("another campaign's Watcher gets 403", async () => {
    await expect(svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: { id: 'gm2', role: 'WATCHER' }, body: { decision: 'LEAVE_OPEN' } }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.buildGenesis({ campaignId: 'c1', sessionId: 's1', user: { id: 'gm2', role: 'WATCHER' }, body: {} }))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(db.prods[0].status).toBe('OPEN');
  });

  it('ANSWER needs an answer; the campaign GM and ADMIN may decide', async () => {
    await expect(svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: GM, body: { decision: 'ANSWER', answer: '  ' } })).rejects.toThrow();
    await svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: { id: 'adm', role: 'ADMIN' }, body: { decision: 'YOU_DECIDE' } });
    expect(db.prods[0]).toMatchObject({ status: 'DELEGATED', decidedById: 'adm' });
  });
});

describe('Build', () => {
  it('with OPEN prods requires confirmLeaveOpen, then marks them LEFT_OPEN and moves on', async () => {
    await raise(1);
    await raise(2);
    await svc.endProdRound({ sessionId: 's1' }, 'c1');
    await svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: GM, body: { decision: 'ANSWER', answer: 'Her brother.' } });
    await expect(svc.buildGenesis({ campaignId: 'c1', sessionId: 's1', user: GM, body: {} })).rejects.toThrow(/1 unanswered prod will be left open/);
    expect(session().stage).toBe('PRODDING');
    const r = await svc.buildGenesis({ campaignId: 'c1', sessionId: 's1', user: GM, body: { confirmLeaveOpen: true } });
    expect(r).toMatchObject({ stage: 'BUILDING', leftOpen: 1 });
    expect(db.prods.map(p => p.status)).toEqual(['ANSWERED', 'LEFT_OPEN']);
    expect(session()).toMatchObject({ stage: 'BUILDING', status: 'active' });
    // After Build, end_prod_round is closed for good (raise_prod is not — a mid-build question).
    await expect(svc.endProdRound({ sessionId: 's1' }, 'c1')).rejects.toThrow(/prod stage/);
  });

  it('with nothing open builds without a confirm', async () => {
    await expect(svc.buildGenesis({ campaignId: 'c1', sessionId: 's1', user: GM, body: {} })).resolves.toMatchObject({ leftOpen: 0 });
  });
});

describe('record_delegated_choice', () => {
  it('fills jewlFill on a delegated prod and refuses an open thread', async () => {
    await raise(1);
    await raise(2);
    db.prods[0].status = 'DELEGATED';
    db.prods[1].status = 'LEFT_OPEN';
    const row = await svc.recordDelegatedChoice({ prodId: 'p1', choice: 'The miller set it, for the insurance.' }, 'c1');
    expect(row.jewlFill).toBe('The miller set it, for the insurance.');
    await expect(svc.recordDelegatedChoice({ prodId: 'p2', choice: 'x' }, 'c1')).rejects.toThrow(/Never fill it/);
    await expect(svc.recordDelegatedChoice({ prodId: 'p1', choice: 'x' }, 'c2')).rejects.toThrow(/not found/i);
  });
});

describe('plan text after Build', () => {
  const p = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
    id, status, anchorQuote: `anchor ${id}`, question: `question ${id}?`, answer: null, jewlFill: null, ...extra,
  });

  it('holds the three sections with the right members', () => {
    const text = buildProdSections([
      p('a', 'ANSWERED', { answer: 'answer a' }),
      p('b', 'LEFT_OPEN'),
      p('c', 'DELEGATED'),
      p('d', 'DELEGATED', { jewlFill: 'fill d' }),
    ]);
    const settled = text.slice(text.indexOf(SETTLED_HEADER), text.indexOf(OPEN_THREADS_HEADER));
    const open = text.slice(text.indexOf(OPEN_THREADS_HEADER), text.indexOf(DELEGATED_HEADER));
    const delegated = text.slice(text.indexOf(DELEGATED_HEADER));
    expect(settled).toContain('"anchor a"');
    expect(settled).toContain('answer a');
    expect(settled).not.toContain('anchor b');
    expect(open).toContain('"anchor b" → question b?');
    expect(open).toMatch(/NEVER invent their answers/);
    expect(open).not.toContain('anchor a');
    expect(open).not.toContain('anchor c');
    expect(delegated).toContain('[c]');
    expect(delegated).toContain('not yet recorded');
    expect(delegated).toContain('YOUR CHOICE (recorded): fill d');
    expect(delegated).toContain('record_delegated_choice');
    expect(delegated).not.toContain('anchor b');
  });

  it('the build cycle carries the sections in its plan', () => {
    const plan = planWorkCycle({ id: 's1', goal: 'g', plan: 'BRIEF', cycleCount: 2, stage: 'BUILDING' },
      [{ ...p('b', 'LEFT_OPEN'), round: 1, order: 1, why: 'w', kind: 'CREATIVE' }], '', []);
    expect(plan.text).toContain(OPEN_THREADS_HEADER);
    expect(plan.text).toContain('"anchor b"');
  });
});

describe('the PRODDING prompt', () => {
  it('carries the law', () => {
    const text = buildProdCycleText({ id: 's1', goal: 'Character genesis: Violet [ch1]', plan: 'BACKSTORY: …', cycleCount: 0 }, []);
    expect(text).toContain(PROD_LAW);
    for (const line of [
      'The GM is the storyteller. You are the production crew, NOT a co-author.',
      'ASK about creative / authorial gaps: who, why, what happened, what it means.',
      'DO NOT ask about mechanical or derivative matters — stats, KV, the consequences of facts already settled, catalog lookups. You will handle those yourself in the build.',
      'Prefer gaps that are load-bearing',
      'Never propose answers inside a question.',
      'No building in this stage: no memories, no entity authoring, no drafts, no sheet.',
      'at most 5 this round',
      'end_prod_round',
      'only the GM\'s Build moves genesis on',
    ]) expect(text).toContain(line);
    expect(text).toContain('BACKSTORY: …');
  });

  it('shows earlier prods and their outcomes so JEWL never re-asks', () => {
    const text = buildProdCycleText({ id: 's1', goal: 'g', plan: 'SEED', cycleCount: 3 }, [
      { id: 'a', round: 1, order: 1, anchorQuote: 'q', question: 'Who?', why: 'w', kind: 'CREATIVE', status: 'LEFT_OPEN', answer: null, jewlFill: null },
    ]);
    expect(text).toContain('LEFT OPEN by the GM');
    expect(text).toContain('never ask it again');
  });
});

describe('a question is a prod at ANY stage (2026-10-12)', () => {
  const building = () => { session().stage = 'BUILDING'; session().status = 'active'; };

  it('a mid-build prod keeps the stage, blocks on the prod ids and posts the question to the chat', async () => {
    building();
    await raise(1);
    expect(session()).toMatchObject({ stage: 'BUILDING', status: 'blocked' });
    expect(session().blockedReason).toBe('waiting on the GM — prods [p1]');
    expect(db.chat).toEqual([{ sessionId: 's1', prodId: 'p1', question: 'Who set the fire? (1)', audience: 'gm' }]);
    await raise(2);
    expect(session().blockedReason).toBe('waiting on the GM — prods [p1,p2]');
    expect(db.chat).toHaveLength(2);
    expect(db.logs.some(l => String(l.heading).startsWith('prod · mid-build'))).toBe(true);
  });

  it('caps a mid-build wait at 5', async () => {
    building();
    for (let i = 1; i <= 5; i++) await raise(i);
    await expect(raise(6)).rejects.toThrow(/already wait on the GM/);
  });

  it('JEWL cannot wake or close a blocked-on-prod session himself', async () => {
    building();
    await raise(1);
    await updateWorkSession({ sessionId: 's1', status: 'active', progressNote: 'pressing on' });
    expect(session().status).toBe('blocked');
    await expect(updateWorkSession({ sessionId: 's1', status: 'done' })).rejects.toThrow(/still wait on the GM/);
  });

  it('resumes on decide — no Build — once every open prod is decided', async () => {
    building();
    await raise(1);
    await raise(2);
    const a = await svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: GM, body: { decision: 'ANSWER', answer: 'Fugue.' } });
    expect(a.resumed).toBe(false);
    expect(session()).toMatchObject({ status: 'blocked', blockedReason: 'waiting on the GM — prods [p2]' });
    const b = await svc.decideProd({ campaignId: 'c1', prodId: 'p2', user: GM, body: { decision: 'YOU_DECIDE' } });
    expect(b.resumed).toBe(true);
    expect(session()).toMatchObject({ stage: 'BUILDING', status: 'active', blockedReason: null, prodRound: 0 });
    expect(db.kicks).toBe(1);
  });

  it('the decided answer reaches the next build cycle; raise_prod stays offered', () => {
    const plan = planWorkCycle(
      { id: 's1', goal: 'Character genesis: Violet [ch1] — x', plan: 'BRIEF', cycleCount: 4, stage: 'BUILDING' },
      [{ id: 'p1', round: 2, order: 1, anchorQuote: 'Written Self', question: 'Fugue or bleed?', why: 'w', kind: 'MECHANICAL_CHECK', status: 'ANSWERED', answer: 'Fugue.', jewlFill: null }],
      '', [],
    );
    expect(plan.stageTools).toEqual(['raise_prod', 'set_starting_age']);
    expect(plan.allowedTools).toBeUndefined();
    expect(plan.text).toContain('Fugue or bleed? → Fugue.');
    expect(plan.text).toContain('QUESTIONS FOR THE GM');
    expect(plan.text).toMatch(/NEVER write a question to the GM into your report/);
  });

  it('a non-genesis work cycle gets no raise_prod', () => {
    const plan = planWorkCycle({ id: 'w', goal: 'Build the tavern', plan: null, cycleCount: 0 }, [], '', []);
    expect(plan.stageTools).toBeUndefined();
  });
});

describe('prods carry an AUDIENCE — whoever owns the answer (2026-10-16)', () => {
  const PLAYER = { id: 'pl', role: 'TRAILBLAZER' };
  const PLAYER2 = { id: 'pl2', role: 'TRAILBLAZER' };

  it('defaults to gm; player and player:<id> are stored and delivered with the prod', async () => {
    await raise(1);
    await raise(2, { audience: 'player' });
    await raise(3, { audience: 'player:ch2' });
    expect(db.prods.map(p => p.audience)).toEqual(['gm', 'player', 'player:ch2']);
    expect(db.chat.map(c => c.audience)).toEqual(['gm', 'player', 'player:ch2']);
  });

  it('player:<her own id> is plain player; player:<not of this campaign> is refused; a bad shape is refused', async () => {
    await raise(1, { audience: 'player:ch1' });
    expect(db.prods[0].audience).toBe('player');
    await expect(raise(2, { audience: 'player:other' })).rejects.toThrow(/not a character of this campaign/);
    await expect(raise(3, { audience: 'watcher' })).rejects.toThrow();
    expect(db.prods).toHaveLength(1);
  });

  describe('mayDecideProd (pure)', () => {
    const ctx = { gmUserId: 'gm', ownerUserId: 'pl', namedOwnerUserId: 'pl2' };
    it('the GM and ADMIN decide everything', () => {
      for (const a of ['gm', 'player', 'player:ch2']) {
        expect(svc.mayDecideProd(GM, { ...ctx, audience: a })).toBe(true);
        expect(svc.mayDecideProd({ id: 'adm', role: 'ADMIN' }, { ...ctx, audience: a })).toBe(true);
      }
    });
    it("the character's owner decides only 'player'; the named owner only 'player:<id>'", () => {
      expect(svc.mayDecideProd(PLAYER, { ...ctx, audience: 'gm' })).toBe(false);
      expect(svc.mayDecideProd(PLAYER, { ...ctx, audience: 'player' })).toBe(true);
      expect(svc.mayDecideProd(PLAYER, { ...ctx, audience: 'player:ch2' })).toBe(false);
      expect(svc.mayDecideProd(PLAYER2, { ...ctx, audience: 'player:ch2' })).toBe(true);
      expect(svc.mayDecideProd(PLAYER2, { ...ctx, audience: 'player' })).toBe(false);
      expect(svc.mayDecideProd(PLAYER, { ...ctx, audience: null })).toBe(false);
      expect(svc.mayDecideProd(PLAYER, { ...ctx, ownerUserId: null, audience: 'player' })).toBe(false);
    });
  });

  it("Violet's player decides a 'player' prod and the session resumes; not a 'gm' one; never SAIL", async () => {
    session().stage = 'WORLD';
    await raise(1, { audience: 'player' });
    await raise(2);
    await expect(svc.decideProd({ campaignId: 'c1', prodId: 'p2', user: PLAYER, body: { decision: 'LEAVE_OPEN' } }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: PLAYER, body: { decision: 'SAIL' } }))
      .rejects.toThrow(/Only the campaign GM can tell JEWL/);
    const r = await svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: PLAYER, body: { decision: 'ANSWER', answer: 'A fourth-floor walkup.' } });
    expect(db.prods[0]).toMatchObject({ status: 'ANSWERED', decidedById: 'pl' });
    expect(r.resumed).toBe(false); // p2 still waits on the GM
    await svc.decideProd({ campaignId: 'c1', prodId: 'p2', user: GM, body: { decision: 'YOU_DECIDE' } });
    expect(session().status).toBe('active');
    expect(db.logs.some(l => l.heading === 'prod · player decided')).toBe(true);
  });

  it("another player decides only a prod addressed to their character", async () => {
    session().stage = 'WORLD';
    await raise(1, { audience: 'player:ch2' });
    await expect(svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: PLAYER, body: { decision: 'LEAVE_OPEN' } }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await svc.decideProd({ campaignId: 'c1', prodId: 'p1', user: PLAYER2, body: { decision: 'ANSWER', answer: 'We grew up on the same stair.' } });
    expect(db.prods[0]).toMatchObject({ status: 'ANSWERED', decidedById: 'pl2' });
  });

  it("the owner reads her character's prods; a stranger does not", async () => {
    await raise(1, { audience: 'player' });
    const mine = await svc.getCharacterProds({ campaignId: 'c1', characterId: 'ch1', user: PLAYER });
    expect(mine.prods).toHaveLength(1);
    await expect(svc.getCharacterProds({ campaignId: 'c1', characterId: 'ch1', user: PLAYER2 })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('JEWL asks in the chat; the chat reply answers (2026-10-12)', () => {
  it('every raised prod — PRODDING too — goes to the chat as its own message', async () => {
    await raise(1);
    expect(db.chat).toEqual([{ sessionId: 's1', prodId: 'p1', question: 'Who set the fire? (1)', audience: 'gm' }]);
  });

  it("the Watcher's plain reply answers the open prod, JEWL acks, the session resumes", async () => {
    session().stage = 'BUILDING';
    await raise(1);
    const r = await svc.answerOpenProdFromChat({ campaignId: 'c1', user: { ...GM, username: 'Mike' }, text: 'Fugue.' });
    expect(r).toMatchObject({ prodId: 'p1', sessionId: 's1', resumed: true, ack: 'ack ANSWER' });
    expect(db.prods[0]).toMatchObject({ status: 'ANSWERED', answer: 'Fugue.' });
    expect(session().status).toBe('active');
    expect(db.userMsgs[0]).toMatchObject({ role: 'user', content: 'Fugue.', userId: 'gm' });
    expect(db.acks).toEqual([{ d: 'ANSWER', resumed: true }]);
  });

  it('nothing open, or not the GM → the reply is an ordinary JEWL turn', async () => {
    expect(await svc.answerOpenProdFromChat({ campaignId: 'c1', user: GM, text: 'hello' })).toBeNull();
    session().stage = 'BUILDING';
    await raise(1);
    expect(await svc.answerOpenProdFromChat({ campaignId: 'c1', user: { id: 'pl', role: 'TRAILBLAZER' }, text: 'x' })).toBeNull();
    expect(db.prods[0].status).toBe('OPEN');
  });
});
