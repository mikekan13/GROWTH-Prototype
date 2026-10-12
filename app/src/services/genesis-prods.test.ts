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
  chat: [] as Array<{ sessionId: string; prodId: string; question: string }>,
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
    campaign: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        (where.id === 'c1' ? { id: 'c1', gmUserId: 'gm' } : where.id === 'c2' ? { id: 'c2', gmUserId: 'gm2' } : null)),
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
    expect(db.chat).toEqual([{ sessionId: 's1', prodId: 'p1', question: 'Who set the fire? (1)' }]);
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
    expect(plan.stageTools).toEqual(['raise_prod']);
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
