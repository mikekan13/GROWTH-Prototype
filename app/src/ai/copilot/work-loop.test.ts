/**
 * The work loop runs unattended and concurrently (perf pass 2026-10-12).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sessions: Array<Record<string, unknown>> = [];
const connections = new Map<string, number>();
const dispatch = vi.fn();
const updateWorkSession = vi.fn(async (_o: unknown) => ({}));

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/krma/wallet', () => ({ getCampaignEconomy: vi.fn(async () => ({ fluid: 1, crystallized: 1, total: 2 })) }));
vi.mock('@/lib/campaign-stream', () => ({ getConnectionCount: (id: string) => connections.get(id) ?? 0 }));
vi.mock('@/services/daya-work-session', () => ({
  getActiveWorkSessions: vi.fn(async () => sessions),
  parseProgress: () => [],
  touchCycle: vi.fn(async () => ({})),
  updateWorkSession: (o: unknown) => updateWorkSession(o),
}));
vi.mock('./jewl-identity', () => ({ getJewlGodHead: vi.fn(async () => ({ characterUserId: 'jewl' })) }));
vi.mock('@/services/character-genesis-progress', () => ({
  GENESIS_CHAT_USERNAME: '[genesis]',
  isGenesisGoal: (g: string) => g.startsWith('Character genesis'),
  parseGenesisGoal: (g: string) => {
    const m = /^Character genesis: (.+?) \[([^\]\s]+)\]/.exec(g);
    return m ? { name: m[1], characterId: m[2] } : null;
  },
  logGenesisReport: vi.fn(async () => {}),
}));
vi.mock('@/services/forge', () => ({ getGlobalCatalogSnapshot: vi.fn(async () => ({ counts: {}, total: 0 })) }));
vi.mock('@/services/genesis-prods', () => ({ listSessionProds: vi.fn(async () => []) }));
vi.mock('./runtime', () => ({ dispatchPrompt: (p: unknown) => dispatch(p) }));

import { workLoopTick } from './work-loop';

function session(id: string, over: Record<string, unknown> = {}) {
  return { id, campaignId: 'camp', goal: `job ${id}`, plan: null, progress: '[]', cycleCount: 0, stage: null, continueUnattended: true, ...over };
}

/** A dispatch that stays pending until released. */
function deferredDispatches() {
  const releases: Array<() => void> = [];
  dispatch.mockImplementation(() => new Promise(resolve => {
    releases.push(() => resolve({ message: 'ok', toolCalls: [{ name: 'x' }] }));
  }));
  return releases;
}

const FAR = Date.now() + 3_600_000;

beforeEach(() => {
  sessions.length = 0;
  connections.clear();
  dispatch.mockReset();
  updateWorkSession.mockClear();
  delete process.env.JEWL_WORK_CONCURRENCY;
  const st = (globalThis as unknown as { __dayaWorkLoop: { inFlight: Map<string, unknown>; cooldownUntil: Map<string, number>; dispatchFailures: Map<string, number>; stalls: Map<string, number> } }).__dayaWorkLoop;
  st.inFlight.clear();
  st.cooldownUntil.clear();
  st.dispatchFailures.clear();
  st.stalls.clear();
});

describe('workLoopTick', () => {
  it('two sessions advance in the same tick; a third waits for a slot', async () => {
    const releases = deferredDispatches();
    sessions.push(session('a'), session('b'), session('c'));
    const t1 = await workLoopTick();
    expect(t1.started).toEqual(['a', 'b']);
    expect(t1.waiting).toBe(1);
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2)); // both cycles in flight at once

    // Still full: nothing more starts.
    expect((await workLoopTick()).started).toEqual([]);

    releases[0]();
    const st = (globalThis as unknown as { __dayaWorkLoop: { inFlight: Map<string, unknown> } }).__dayaWorkLoop;
    await vi.waitFor(() => expect(st.inFlight.size).toBe(1));
    const t3 = await workLoopTick(); // a is in its breather; c takes the free slot
    expect(t3.started).toEqual(['c']);
    await vi.waitFor(() => expect(releases.length).toBe(3));
    releases.slice(1).forEach(r => r());
    await vi.waitFor(() => expect(st.inFlight.size).toBe(0));
  });

  it('JEWL_WORK_CONCURRENCY sets the slot count', async () => {
    deferredDispatches();
    process.env.JEWL_WORK_CONCURRENCY = '1';
    sessions.push(session('a'), session('b'));
    expect((await workLoopTick()).started).toEqual(['a']);
  });

  it('a genesis runs with no SSE connection open; an attended job waits for the GM', async () => {
    deferredDispatches();
    sessions.push(
      session('g', { goal: 'Character genesis: Violet [c1] — gestate', continueUnattended: false, stage: 'BUILDING' }),
      session('att', { continueUnattended: false }),
    );
    const t = await workLoopTick();
    expect(t.started).toEqual(['g']);
    connections.set('camp', 1);
    expect((await workLoopTick()).started).toEqual(['att']);
  });

  it('never runs two cycles on one character', async () => {
    deferredDispatches();
    sessions.push(
      session('g1', { goal: 'Character genesis: Violet [c1] — a' }),
      session('g2', { goal: 'Character genesis: Violet [c1] — b' }),
    );
    expect((await workLoopTick()).started).toEqual(['g1']);
  });

  it('a 429 that survives the backoff never auto-blocks the session', async () => {
    dispatch.mockRejectedValue(Object.assign(new Error('429 rate limited'), { status: 429 }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sessions.push(session('r429'));
    const st = (globalThis as unknown as { __dayaWorkLoop: { inFlight: Map<string, unknown> } }).__dayaWorkLoop;
    for (let i = 0; i < 4; i++) {
      await workLoopTick(FAR * (i + 1)); // past every cooldown
      await vi.waitFor(() => expect(st.inFlight.size).toBe(0));
    }
    const mine = dispatch.mock.calls.filter(c => String((c[0] as { text: string }).text).includes('work session r429'));
    expect(mine).toHaveLength(4);
    expect(updateWorkSession).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }));
  });

  it('a genesis build cycle with an empty catalog withholds search_catalog', async () => {
    dispatch.mockResolvedValue({ message: 'ok', toolCalls: [{ name: 'x' }] });
    sessions.push(session('g', { goal: 'Character genesis: Violet [c1] — gestate', stage: 'BUILDING' }));
    await workLoopTick();
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ excludedTools: ['search_catalog'] }));
  });
});
