/** JEWL's work screen (2026-10-12) — session-type adapters, Needs-you, the state line. */
import { describe, it, expect } from 'vitest';
import {
  classifySessionType, defaultSessionView, draftingSessionView, genesisSessionView, jewlStateLine,
  mergeNeedsYou, needsYouCount, orderSessions, reconciliationSessionView, portraitNeedsYou, genesisAwaitingImage,
  type JewlWorkPayload, type WorkSessionFacts,
} from './jewl-work';
import type { GenesisProgress, GenesisGmStep } from '@/services/character-genesis-progress';

const facts = (over: Partial<WorkSessionFacts> = {}): WorkSessionFacts => ({
  id: 's1', goal: 'Tidy the tavern [cabc123]', status: 'active', cycleCount: 3, blockedReason: null,
  startedAt: new Date('2026-10-12T10:00:00Z'), endedAt: null, lastCycleAt: new Date('2026-10-12T10:05:00Z'),
  notes: ['read the room', 'placed two tables'], ...over,
});

function genesis(over: Partial<GenesisProgress> = {}): GenesisProgress {
  return {
    state: 'running', sessionId: 'g1', current: 'mechanics', step: 5, total: 7,
    stages: [
      { key: 'open', label: 'Genesis session opened', status: 'done' },
      { key: 'mechanics', label: 'Translating to mechanics', status: 'current' },
      { key: 'born', label: 'Born', status: 'pending' },
    ],
    counts: { cycles: 4, memories: 12, blocksForged: 2, traitsForged: 3, otherForged: 0, pendingApproval: 1, approved: 4 },
    wait: null, error: null, gmSteps: [], prodding: false, prods: [], openThreads: [],
    startedAt: '2026-10-12T10:00:00.000Z', endedAt: null, lastCycleAt: null, seedWarnings: [], ...over,
  };
}

const step = (id: string): GenesisGmStep => ({
  id, type: 'nectar', name: 'Steady Hands', kv: 12, pricedBy: 'Kai', description: null, rules: [], ageAdded: null, purpose: 'for the forge scene', draftedAt: null,
});

describe('classifySessionType', () => {
  it('maps goals onto the four adapters', () => {
    expect(classifySessionType('Character genesis: Violet [c1] — gestate')).toBe('genesis');
    expect(classifySessionType('Reconcile the tavern narration with the sim')).toBe('reconciliation');
    expect(classifySessionType('Draft three thorns for the bandit camp')).toBe('drafting');
    expect(classifySessionType('Organize the canvas')).toBe('default');
  });
});

describe('session-type adapters', () => {
  it('genesis: blocks / traits / memories, the real ladder, prods + drafts need you', () => {
    const p = genesis({
      state: 'waiting', wait: 'prods', prodding: true, gmSteps: [step('f1')],
      prods: [
        { id: 'p1', round: 1, order: 1, anchorQuote: 'q', question: 'Who taught her?', why: 'gap', kind: 'gap', status: 'OPEN', answer: null, jewlFill: null, decidedAt: null },
        { id: 'p2', round: 1, order: 2, anchorQuote: 'q', question: 'Where?', why: 'gap', kind: 'gap', status: 'ANSWERED', answer: 'x', jewlFill: null, decidedAt: null },
      ],
    });
    const v = genesisSessionView({ id: 'g1', characterId: 'c1', name: 'Violet', progress: p });
    expect(v.type).toBe('genesis');
    expect(v.pillars.map(x => [x.label, x.sub])).toEqual([['BODY', '2 blocks'], ['SPIRIT', '3 traits'], ['SOUL', '12 memories']]);
    expect(v.stages.map(s => s.key)).toEqual(['open', 'mechanics', 'born']);
    expect(v.needsYou.map(n => [n.kind, n.id])).toEqual([['prod', 'p1'], ['draft', 'f1']]);
    expect(v.genesis?.name).toBe('Violet');
    expect(v.title).toBe('Genesis · Violet');
  });

  it('drafting: drafts / approved / pending; pending drafts are Needs-you', () => {
    const v = draftingSessionView(facts({ goal: 'Draft thorns', status: 'blocked', blockedReason: 'awaiting approval' }),
      { drafts: 4, approved: 1, pending: 3 }, [step('f1'), step('f2'), step('f3')]);
    expect(v.pillars.map(p => p.count)).toEqual([4, 1, 3]);
    expect(v.pillars.map(p => p.sub)).toEqual(['4 drafts', '1 approved', '3 pending']);
    expect(v.current).toBe('watcher');
    expect(v.state).toBe('waiting');
    expect(v.needsYou.filter(n => n.kind === 'draft')).toHaveLength(3);
    expect(v.needsYou.some(n => n.kind === 'question')).toBe(false); // the drafts are the wait
    const bare = draftingSessionView(facts({ goal: 'Draft thorns', status: 'blocked', blockedReason: 'which camp?' }), { drafts: 0, approved: 0, pending: 0 });
    expect(bare.needsYou.map(n => n.kind)).toEqual(['question']);
  });

  it('reconciliation: facts / conflicts / resolved', () => {
    const v = reconciliationSessionView(facts({ goal: 'Reconcile' }), { facts: 5, conflicts: 2, resolved: 3 });
    expect(v.pillars.map(p => [p.label, p.count])).toEqual([['BODY', 5], ['SPIRIT', 2], ['SOUL', 3]]);
    expect(v.current).toBe('asking');
  });

  it('default: cycles / tool calls / items written; log = his notes; ids stripped from the title', () => {
    const v = defaultSessionView(facts(), { toolCalls: 17, itemsWritten: 2 });
    expect(v.pillars.map(p => p.count)).toEqual([3, 17, 2]);
    expect(v.pillars[1].sub).toBe('17 tool calls');
    expect(v.title).toBe('Tidy the tavern');
    expect(v.log).toEqual(['read the room', 'placed two tables']);
    expect(v.state).toBe('running');
    expect(v.current).toBe('working');
  });

  it('a provider failure is an error, not a Needs-you; done fills the tubes', () => {
    const err = defaultSessionView(facts({ status: 'blocked', blockedReason: 'AI provider failing: 529' }), { toolCalls: 0, itemsWritten: 0 });
    expect(err.state).toBe('error');
    expect(err.needsYou).toEqual([]);
    const done = defaultSessionView(facts({ status: 'done', endedAt: new Date() }), { toolCalls: 1, itemsWritten: 1 });
    expect(done.state).toBe('done');
    expect(done.pillars.every(p => p.fill === 1)).toBe(true);
    expect(done.stages.every(s => s.status === 'done')).toBe(true);
  });
});

describe('campaign level', () => {
  const a = defaultSessionView(facts({ id: 'a', status: 'blocked', blockedReason: 'which door?', lastCycleAt: new Date('2026-10-12T09:00:00Z') }), { toolCalls: 0, itemsWritten: 0 });
  const b = defaultSessionView(facts({ id: 'b', lastCycleAt: new Date('2026-10-12T08:00:00Z') }), { toolCalls: 0, itemsWritten: 0 });

  it('orders active sessions first, then most recent', () => {
    expect(orderSessions([a, b]).map(s => s.id)).toEqual(['b', 'a']);
  });

  it('the badge count = every Needs-you item (sessions + campaign-level, deduplicated)', () => {
    const extra = [{ id: 'r1', kind: 'reconciliation' as const, sessionId: null, title: 'Mistake, or somewhere new?' }];
    const needsYou = mergeNeedsYou([a, b, a], extra);
    expect(needsYou.map(n => n.kind)).toEqual(['question', 'reconciliation']);
    const payload: JewlWorkPayload = { sessions: [a, b], needsYou, recentLog: [], cycling: true };
    expect(needsYouCount(payload)).toBe(2);
    expect(needsYouCount(null)).toBe(0);
  });

  it('the state line: live work, a running session, waiting, needs-you, idle', () => {
    expect(jewlStateLine(null, 'created "Main Room"')).toBe('building — created "Main Room"');
    expect(jewlStateLine({ sessions: [b], needsYou: [], recentLog: [], cycling: true })).toBe('Tidy the tavern · cycle 3');
    expect(jewlStateLine({ sessions: [a], needsYou: a.needsYou, recentLog: [], cycling: false })).toBe('waiting on you · Tidy the tavern');
    expect(jewlStateLine({ sessions: [], needsYou: [{ id: 'r', kind: 'reconciliation', sessionId: null, title: 't' }], recentLog: [], cycling: false })).toBe('1 thing needs you');
    expect(jewlStateLine({ sessions: [], needsYou: [], recentLog: [], cycling: false })).toBe('idle — watching');
  });
});

// BORN ≠ DONE (Mike 2026-10-12): after Born the Portrait step needs the user.
describe('Portrait step (born ≠ done)', () => {
  const born = (image: 'pending' | 'locked' | 'done') => genesis({
    state: 'done', current: 'born', step: 7, endedAt: '2026-10-12T11:00:00.000Z',
    completion: { genesis: 'born', image, done: image === 'done' },
  });

  it('born + no image → a Portrait item in Needs-you; the finished session stays listed', () => {
    const v = genesisSessionView({ id: 'g1', characterId: 'c1', name: 'Violet', progress: born('pending') });
    expect(genesisAwaitingImage(born('pending'))).toBe(true);
    expect(v.needsYou).toEqual([expect.objectContaining({ kind: 'portrait', id: 'c1', characterId: 'c1', sessionId: 'g1', title: 'Portrait · Violet' })]);
  });

  it('a locked identity without the official portrait still needs you', () => {
    const v = genesisSessionView({ id: 'g1', characterId: 'c1', name: 'Violet', progress: born('locked') });
    expect(v.needsYou.map(i => i.kind)).toEqual(['portrait']);
  });

  it('official portrait accepted → the item disappears', () => {
    const v = genesisSessionView({ id: 'g1', characterId: 'c1', name: 'Violet', progress: born('done') });
    expect(genesisAwaitingImage(born('done'))).toBe(false);
    expect(v.needsYou).toEqual([]);
  });

  it('no completion carried / still running → no portrait item', () => {
    expect(genesisSessionView({ id: 'g1', characterId: 'c1', name: 'V', progress: genesis({ state: 'done' }) }).needsYou).toEqual([]);
    expect(genesisSessionView({ id: 'g1', characterId: 'c1', name: 'V', progress: genesis({ completion: { genesis: 'pending', image: 'pending', done: false } }) }).needsYou).toEqual([]);
  });

  it('the campaign copy dedupes against the session copy; the count includes pending portraits', () => {
    const v = genesisSessionView({ id: 'g1', characterId: 'c1', name: 'Violet', progress: born('pending') });
    const merged = mergeNeedsYou([v], [portraitNeedsYou('c1', 'Violet', null), portraitNeedsYou('k1', 'Kai', null)]);
    expect(merged.map(i => `${i.kind}:${i.id}:${i.sessionId}`)).toEqual(['portrait:c1:g1', 'portrait:k1:null']);
    expect(needsYouCount({ needsYou: merged })).toBe(2);
  });
});
