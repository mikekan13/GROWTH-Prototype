/** Genesis loading screen (2026-10-11) — progress derived from DB truth, GM-only, no text leak. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, NotFoundError } from '@/lib/errors';

const db = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  entity: null as null | Record<string, unknown>,
  forged: [] as Array<{ type: string; status: string }>,
  forgeWhere: null as unknown,
  chat: [] as Array<Record<string, unknown>>,
  events: [] as Array<Record<string, unknown>>,
  prods: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'ch1' ? { id: 'ch1', campaignId: 'c1' } : null),
    },
    campaign: {
      findUnique: vi.fn(async () => ({ id: 'c1', gmUserId: 'gm' })),
    },
    dayaWorkSession: { findFirst: vi.fn(async () => db.session), findUnique: vi.fn(async () => db.session) },
    copilotMessage: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { db.chat.push(data); return { id: 'm1' }; }) },
    dayaEntity: { findUnique: vi.fn(async () => db.entity) },
    genesisProd: { findMany: vi.fn(async () => db.prods) },
    forgeItem: {
      findMany: vi.fn(async (args: { where: unknown }) => { db.forgeWhere = args.where; return db.forged; }),
    },
  },
}));
vi.mock('./campaign-event', () => ({
  createCampaignEvent: vi.fn(async (input: Record<string, unknown>) => { db.events.push(input); return { id: 'ev1' }; }),
}));
vi.mock('@/ai/copilot/jewl-identity', () => ({
  getJewlGodHead: vi.fn(async () => ({ characterUserId: 'jewl-user' })),
}));

const {
  deriveGenesisProgress, classifyWait, getGenesisProgress, GENESIS_STAGES,
  parseGenesisGoal, isGenesisGoal, genesisStatusLine, announceGenesisStatus, logGenesisReport,
  announceGenesisProd, genesisProdMessage, prodDecisionAck,
} =
  await import('./character-genesis-progress');

const t0 = new Date('2026-10-11T10:00:00Z');
const session = (over: Record<string, unknown> = {}) => ({
  id: 's1', status: 'active', cycleCount: 3, startedAt: t0, endedAt: null,
  lastCycleAt: t0, blockedReason: null, ...over,
});
const base = { entityAuthored: false, memoryCount: 0, forged: [] as Array<{ type: string; status: string }> };

const statuses = (p: ReturnType<typeof deriveGenesisProgress>) => p.stages.map(s => s.status[0]).join('');

describe('deriveGenesisProgress', () => {
  it('no session → none, all pending', () => {
    const p = deriveGenesisProgress({ ...base, session: null });
    expect(p.state).toBe('none');
    expect(statuses(p)).toBe('ppppppp');
  });

  it('fresh session past the prods (legacy / after Build) → expansion current', () => {
    const p = deriveGenesisProgress({ ...base, session: session() });
    expect(p.state).toBe('running');
    expect(p.current).toBe('expansion');
    expect(statuses(p)).toBe('ddcpppp');
    expect(p.step).toBe(3);
    expect(p.prodding).toBe(false);
    expect(p.total).toBe(GENESIS_STAGES.length);
  });

  it('authored or memories → ledger current with the count', () => {
    const p = deriveGenesisProgress({ ...base, session: session(), entityAuthored: true, memoryCount: 12 });
    expect(p.current).toBe('ledger');
    expect(p.counts.memories).toBe(12);
    expect(statuses(p)).toBe('dddcppp');
  });

  it('drafts forged → mechanics current, counts by kind', () => {
    const p = deriveGenesisProgress({
      ...base, session: session(), entityAuthored: true, memoryCount: 30,
      forged: [
        { type: 'root', status: 'draft' }, { type: 'branch', status: 'draft' },
        { type: 'nectar', status: 'draft' }, { type: 'thorn', status: 'published' },
        { type: 'skill', status: 'draft' },
      ],
    });
    expect(p.current).toBe('mechanics');
    expect(p.counts).toMatchObject({ blocksForged: 2, traitsForged: 2, otherForged: 1, pendingApproval: 4, approved: 1 });
  });

  it('blocked on pending drafts → waiting for approval (mechanics stays current)', () => {
    const p = deriveGenesisProgress({
      ...base, session: session({ status: 'blocked', blockedReason: 'Forge batch awaits the GM — Mara’s root' }),
      entityAuthored: true, forged: [{ type: 'root', status: 'draft' }],
    });
    expect(p.state).toBe('waiting');
    expect(p.wait).toBe('approval');
    expect(p.current).toBe('mechanics');
  });

  it('all drafts approved while active → sheet current', () => {
    const p = deriveGenesisProgress({
      ...base, session: session(), entityAuthored: true, forged: [{ type: 'root', status: 'published' }],
    });
    expect(p.current).toBe('sheet');
  });

  it('done → every stage done, born', () => {
    const p = deriveGenesisProgress({
      ...base, session: session({ status: 'done', endedAt: new Date(t0.getTime() + 60_000) }),
      entityAuthored: true, forged: [{ type: 'root', status: 'published' }],
    });
    expect(p.state).toBe('done');
    expect(p.current).toBe('born');
    expect(statuses(p)).toBe('ddddddd');
    expect(p.endedAt).toBe('2026-10-11T10:01:00.000Z');
  });

  it('provider failure and cancel → error kinds', () => {
    expect(deriveGenesisProgress({ ...base, session: session({ status: 'blocked', blockedReason: 'AI provider failing — 529' }) }))
      .toMatchObject({ state: 'error', error: 'provider' });
    expect(deriveGenesisProgress({ ...base, session: session({ status: 'cancelled' }) }))
      .toMatchObject({ state: 'error', error: 'cancelled' });
  });

  it('SPOILER FIREWALL: no free text from the session ever ships', () => {
    const secret = 'She drowned her brother in the millpond';
    const p = deriveGenesisProgress({
      ...base, session: session({ status: 'blocked', blockedReason: secret }), entityAuthored: true, memoryCount: 4,
    });
    expect(JSON.stringify(p)).not.toContain('millpond');
    expect(p.wait).toBe('question');
  });
});

describe('classifyWait', () => {
  it('maps reasons to fixed kinds', () => {
    expect(classifyWait('AI provider failing — x', 0)).toBe('provider');
    expect(classifyWait('no actionable work for several cycles — waiting on you', 0)).toBe('stalled');
    expect(classifyWait('anything', 2)).toBe('approval');
    expect(classifyWait(null, 0)).toBe('question');
  });
});

describe('getGenesisProgress', () => {
  beforeEach(() => {
    db.session = session();
    db.entity = { personaProfile: JSON.stringify({ identityNarrative: 'secret life' }), _count: { memories: 7 } };
    db.forged = [{ type: 'branch', status: 'draft' }];
  });

  it('GM gets progress; JEWL drafts scoped to the session window', async () => {
    const p = await getGenesisProgress({ characterId: 'ch1', user: { id: 'gm', role: 'WATCHER' } });
    expect(p.current).toBe('mechanics');
    expect(p.counts.memories).toBe(7);
    expect(JSON.stringify(p)).not.toContain('secret life');
    expect(db.forgeWhere).toMatchObject({ campaignId: 'c1', createdBy: 'jewl-user', createdAt: { gte: t0 } });
  });

  it('non-GM is forbidden; missing character 404s', async () => {
    await expect(getGenesisProgress({ characterId: 'ch1', user: { id: 'p1', role: 'TRAILBLAZER' } }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await expect(getGenesisProgress({ characterId: 'nope', user: { id: 'gm', role: 'WATCHER' } }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('no session → none without touching the forge', async () => {
    db.session = null;
    db.forgeWhere = null;
    const p = await getGenesisProgress({ characterId: 'ch1', user: { id: 'gm', role: 'WATCHER' } });
    expect(p.state).toBe('none');
    expect(db.forgeWhere).toBeNull();
  });
});

const GOAL = 'Character genesis: Violet [ch1] — gestate the person from their genome, then translate.';

describe('genesis goal parsing', () => {
  it('reads name + character id from the session goal', () => {
    expect(isGenesisGoal(GOAL)).toBe(true);
    expect(isGenesisGoal('Build the tavern')).toBe(false);
    expect(parseGenesisGoal(GOAL)).toEqual({ name: 'Violet', characterId: 'ch1' });
    expect(parseGenesisGoal('Build the tavern')).toBeNull();
  });
});

describe('genesisStatusLine (chat stays short)', () => {
  const p = (over: Record<string, unknown>, counts: Record<string, number> = {}) =>
    deriveGenesisProgress({ ...base, session: session(over), entityAuthored: true, memoryCount: counts.memories ?? 0,
      forged: Array.from({ length: counts.pending ?? 0 }, () => ({ type: 'root', status: 'draft' })) });
  it('quiet while running', () => {
    expect(genesisStatusLine('Violet', p({}))).toBeNull();
  });
  it('one line for approval, done, provider, cancel — pointing at the Log', () => {
    const approval = genesisStatusLine('Violet', p({ status: 'blocked', blockedReason: 'batch' }, { pending: 5 }))!;
    expect(approval).toMatch(/5 pieces wait/);
    expect(approval).toMatch(/Log under Genesis/);
    expect(genesisStatusLine('Violet', p({ status: 'done', endedAt: t0 }, { memories: 34 }))).toMatch(/^Violet is born — 34 memories/);
    expect(genesisStatusLine('Violet', p({ status: 'blocked', blockedReason: 'AI provider failing — x' }))).toMatch(/resume/);
    expect(genesisStatusLine('Violet', p({ status: 'cancelled' }))).toMatch(/closed/);
    for (const line of [approval]) expect(line.length).toBeLessThan(200);
  });
});

describe('announceGenesisStatus / logGenesisReport', () => {
  beforeEach(() => { db.chat = []; db.events = []; db.entity = null; db.forged = []; });

  it('posts one visible assistant line to the GM on a transition', async () => {
    db.session = session({ status: 'done', endedAt: t0 });
    const line = await announceGenesisStatus({ id: 's1', campaignId: 'c1', goal: GOAL });
    expect(line).toMatch(/Violet is born/);
    expect(db.chat).toHaveLength(1);
    expect(db.chat[0]).toMatchObject({ role: 'assistant', userId: 'gm', content: line });
    expect(db.chat[0].username).toBeUndefined();
  });

  it('stays silent while running and for non-genesis goals', async () => {
    db.session = session();
    expect(await announceGenesisStatus({ id: 's1', campaignId: 'c1', goal: GOAL })).toBeNull();
    expect(await announceGenesisStatus({ id: 's1', campaignId: 'c1', goal: 'Build the tavern' })).toBeNull();
    expect(db.chat).toHaveLength(0);
  });

  it('writes the full report as a genesis_report Log row on the character', async () => {
    const report = ['| Block | Type |', '| Root | 17 yrs |'].join('\n');
    const id = await logGenesisReport({ campaignId: 'c1', goal: GOAL, message: report, cycle: 3, jewlUserId: 'jewl-user' });
    expect(id).toBe('ev1');
    expect(db.events[0]).toMatchObject({
      characterId: 'ch1', characterName: 'Violet', actor: 'ai_copilot',
      payload: { kind: 'game_event', eventType: 'genesis_report' },
    });
    expect((db.events[0].payload as { description: string }).description).toBe(`Violet · cycle 3\n${report}`);
    expect(await logGenesisReport({ campaignId: 'c1', goal: GOAL, message: '  ', cycle: 4, jewlUserId: 'j' })).toBeNull();
  });
});

describe('GM steps — JEWL drafts awaiting the Watcher', () => {
  const draft = {
    id: 'f1', type: 'thorn', status: 'draft', name: 'Sealed Past', karmicValue: BigInt(-12),
    createdAt: t0,
    relationshipTags: JSON.stringify({ evaluation: { evaluator: 'formula (pre-Kai)', price: -12 } }),
    data: JSON.stringify({
      description: 'A wound sealed shut.', pillar: 'spirit', mechanicalEffect: 'Recall falters near the wound.',
      effects: [
        { kind: 'persistent', name: 'Fault line', condition: 'recalling childhood', modifiers: [{ flat: -3, governorAttribute: 'focus', label: 'recall' }] },
        { kind: 'triggered', name: 'Anchor', trigger: 'a sensory anchor surfaces', appliesCondition: 'Confused' },
      ],
      _proposalNote: 'Her amnesia is the campaign hook.',
    }),
  };

  it('maps a pending draft to a full step card', () => {
    const p = deriveGenesisProgress({ ...base, session: session({ status: 'blocked', blockedReason: 'batch' }), entityAuthored: true, forged: [draft, { ...draft, id: 'f2', status: 'published' }] });
    expect(p.gmSteps).toHaveLength(1);
    expect(p.gmSteps[0]).toEqual({
      id: 'f1', type: 'thorn', name: 'Sealed Past', kv: -12, pricedBy: 'formula (pre-Kai)',
      description: 'A wound sealed shut.',
      rules: ['Recall falters near the wound.', 'Fault line — while recalling childhood: -3 focus (recall)', 'Anchor — when a sensory anchor surfaces, applies Confused'],
      ageAdded: null, purpose: 'Her amnesia is the campaign hook.', draftedAt: t0.toISOString(),
    });
  });

  it('keeps listing after the build is done until every draft is submitted', () => {
    const done = deriveGenesisProgress({ ...base, session: session({ status: 'done', endedAt: t0 }), entityAuthored: true, forged: [draft] });
    expect(done.state).toBe('done');
    expect(done.gmSteps.map(g => g.id)).toEqual(['f1']);
    const cleared = deriveGenesisProgress({ ...base, session: session({ status: 'done', endedAt: t0 }), entityAuthored: true, forged: [{ ...draft, status: 'published' }] });
    expect(cleared.gmSteps).toEqual([]);
  });
});

describe('genesis is a dialogue — the prod stage (2026-10-12)', () => {
  const prod = (id: string, status: string, over: Record<string, unknown> = {}) => ({
    id, round: 1, order: Number(id.slice(1)), anchorQuote: `anchor ${id}`, question: `question ${id}?`,
    why: 'w', kind: 'CREATIVE', status, answer: null, jewlFill: null, decidedAt: null, ...over,
  });

  it('PRODDING → listening current with the prod count; nothing else advances', () => {
    const p = deriveGenesisProgress({
      ...base, session: session({ stage: 'PRODDING' }), entityAuthored: true, memoryCount: 9,
      prods: [prod('p1', 'OPEN'), prod('p2', 'ANSWERED', { answer: 'a' })],
    });
    expect(p.prodding).toBe(true);
    expect(p.current).toBe('prodding');
    expect(statuses(p)).toBe('dcppppp');
    expect(p.stages[1].label).toBe('Listening · 2 prods');
    expect(p.prods.map(x => x.id)).toEqual(['p1', 'p2']);
  });

  it('blocked in PRODDING waits on the prods; the chat line counts the open ones', () => {
    const p = deriveGenesisProgress({
      ...base, session: session({ stage: 'PRODDING', status: 'blocked', blockedReason: 'waiting on the GM — prods' }),
      prods: [prod('p1', 'OPEN'), prod('p2', 'OPEN'), prod('p3', 'OPEN'), prod('p4', 'OPEN'), prod('p5', 'LEFT_OPEN')],
    });
    expect(p.state).toBe('waiting');
    expect(p.wait).toBe('prods');
    // The chat carries the question itself — never "see the Log" (2026-10-12).
    expect(genesisStatusLine('Violet', p)).toBe("That's my 4 questions about Violet for now — answer above, leave open, or let me decide. Press Build when you're ready.");
  });

  it('after Build the left-open prods are the open threads', () => {
    const p = deriveGenesisProgress({
      ...base, session: session({ stage: 'BUILDING', status: 'done', endedAt: t0 }),
      prods: [prod('p1', 'ANSWERED', { answer: 'a' }), prod('p2', 'LEFT_OPEN'), prod('p3', 'DELEGATED', { jewlFill: 'f' })],
    });
    expect(p.openThreads).toEqual([{ id: 'p2', anchorQuote: 'anchor p2', question: 'question p2?' }]);
  });
});

describe('JEWL asks in the chat, never "see the Log" (2026-10-12)', () => {
  const prod = (id: string, status: string) => ({
    id, round: 2, order: 1, anchorQuote: 'Written Self', question: 'Is it a fugue or a bleed?',
    why: 'w', kind: 'MECHANICAL_CHECK', status, answer: null, jewlFill: null, decidedAt: null,
  });

  it('blocked-on-prod after Build waits on prods; the status line defers to the prod line', () => {
    const p = deriveGenesisProgress({
      ...base, session: session({ stage: 'BUILDING', status: 'blocked', blockedReason: 'waiting on the GM — prods [p1]' }),
      prods: [prod('p1', 'OPEN')], forged: [{ type: 'thorn', status: 'draft' }],
    });
    expect(p.wait).toBe('prods');
    expect(p.prodding).toBe(false);
    expect(genesisStatusLine('Violet', p)).toBeNull();
  });

  it('the chat message IS the question — full text + why, decisions attached as actions', async () => {
    const before = db.chat.length;
    const long = 'Is it a fugue or a bleed? ' + 'More context. '.repeat(30);
    const line = await announceGenesisProd(
      { id: 's1', campaignId: 'c1', goal: 'Character genesis: Violet [ch1] — x' },
      { id: 'p9', question: long, why: 'The thorn hinges on it.' },
    );
    expect(line).toBe(genesisProdMessage('Violet', { question: long, why: 'The thorn hinges on it.' }));
    expect(line).toContain(long.trim());
    expect(line).toContain('Why I ask: The thorn hinges on it.');
    expect(line).not.toMatch(/Log|page/);
    const row = db.chat[before] as { content: string; userId: string; actions: string };
    expect(row.userId).toBe('gm');
    expect(JSON.parse(row.actions)).toEqual([{
      id: 'p9', type: 'genesis_prod', description: 'The thorn hinges on it.', status: 'pending',
      params: { source: 'GENESIS_PROD', prodId: 'p9', sessionId: 's1', characterId: 'ch1', decisions: ['ANSWER', 'LEAVE_OPEN', 'YOU_DECIDE'] },
    }]);
  });

  it('JEWL acknowledges a decision in one line', () => {
    expect(prodDecisionAck('Violet', 'ANSWER', true)).toBe("Got it — I'll build on that. Back to Violet.");
    expect(prodDecisionAck('Violet', 'LEAVE_OPEN', false)).not.toContain(String.fromCharCode(10));
  });

  it('a free-text wait carries JEWL words, never a Log pointer', () => {
    const p = deriveGenesisProgress({ ...base, session: session({ stage: 'BUILDING', status: 'blocked', blockedReason: 'Is she gone during the episode?' }) });
    expect(p.wait).toBe('question');
    const line = genesisStatusLine('Violet', p, 'Is she gone during the episode?')!;
    expect(line).toContain('“Is she gone during the episode?”');
    expect(line).not.toMatch(/Log/);
  });
});
