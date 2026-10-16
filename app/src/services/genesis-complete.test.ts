/** completeCharacter (2026-10-12): a born character gets a session running only her missing stages. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, open, kick, dedupe, sync, detect } = vi.hoisted(() => ({
  db: {
    character: { findUnique: vi.fn() },
    dayaWorkSession: { findFirst: vi.fn() },
    genesisProd: { findMany: vi.fn() },
  },
  open: vi.fn(),
  kick: vi.fn(),
  dedupe: vi.fn(),
  sync: vi.fn(),
  detect: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./campaign-access', () => ({ requireCampaignGM: vi.fn(async () => ({ id: 'c1', gmUserId: 'gm1' })) }));
vi.mock('./daya-work-session', () => ({ openWorkSession: (...a: unknown[]) => open(...a) }));
vi.mock('@/ai/copilot/work-loop', () => ({ kickWorkLoop: kick }));
vi.mock('./genesis-sheet-sync', () => ({ dedupeBlockLinks: (...a: unknown[]) => dedupe(...a), syncCreationFromBlockLinks: (...a: unknown[]) => sync(...a) }));
vi.mock('./genesis-stages', async () => {
  const pure = await import('@/lib/genesis-stages');
  return { ...pure, detectMissingStages: (...a: unknown[]) => detect(...a) };
});

import { completeCharacter, COMPLETION_HEADER } from './genesis-complete';
import { OPEN_THREADS_HEADER } from './character-genesis-plan';

const GM = { id: 'gm1', role: 'WATCHER' };
const VIOLET = { id: 'v', name: 'Violet', campaignId: 'c1', genesisTier: null, data: '{}', daya: { status: 'ACTIVE' } };

beforeEach(() => {
  vi.clearAllMocks();
  db.character.findUnique.mockResolvedValue(VIOLET);
  db.dayaWorkSession.findFirst
    .mockResolvedValueOnce(null) // nothing in flight
    .mockResolvedValueOnce({ id: 'born1', plan: 'GENESIS BRIEF — Violet\nAGE: 25\nBACKSTORY:\n…' });
  db.genesisProd.findMany.mockResolvedValue([
    { id: 'p1', anchorQuote: 'the key', question: 'Who gave her the key?', status: 'LEFT_OPEN', answer: null, jewlFill: null },
  ]);
  dedupe.mockResolvedValue({ removed: ['dup'] });
  sync.mockResolvedValue({ corrections: ['fate die d6 → d8 (seed)', 'frequency 1/1 → 40/40 (seed)'] });
  open.mockResolvedValue({ id: 'sess2' });
});

describe('completeCharacter', () => {
  it('opens a session at the first missing stage and lists only the missing ones', async () => {
    detect.mockResolvedValue(new Set(['WORLD', 'VINES']));
    const r = await completeCharacter('v', GM);
    expect(r).toMatchObject({ opened: true, sessionId: 'sess2', stages: ['WORLD', 'VINES'], removedDuplicateLinks: 1, seedCorrections: ['fate die d6 → d8 (seed)', 'frequency 1/1 → 40/40 (seed)'] });
    const opts = open.mock.calls[0][0];
    expect(opts.stage).toBe('WORLD');
    expect(opts.goal).toMatch(/^Character genesis: Violet \[v\] — complete the born character: WORLD → VINES/);
    expect(opts.continueUnattended).toBe(true);
    expect(opts.plan).toContain(COMPLETION_HEADER);
    expect(opts.plan).toContain('AGE: 25');
    // Left-open threads from her birth stay open in the new plan.
    expect(opts.plan).toContain(OPEN_THREADS_HEADER);
    expect(opts.plan).toContain('Who gave her the key?');
    expect(dedupe).toHaveBeenCalledWith('v');
    expect(sync).toHaveBeenCalledWith('v');
    expect(kick).toHaveBeenCalled();
  });

  it('opens nothing when she lacks nothing', async () => {
    detect.mockResolvedValue(new Set());
    const r = await completeCharacter('v', GM);
    expect(r).toMatchObject({ opened: false, stages: [] });
    expect(open).not.toHaveBeenCalled();
  });

  it('refuses while a genesis is in flight', async () => {
    db.dayaWorkSession.findFirst.mockReset().mockResolvedValueOnce({ id: 'running' });
    await expect(completeCharacter('v', GM)).rejects.toThrow(/already running/);
  });

  it('refuses a character that is not born', async () => {
    db.character.findUnique.mockResolvedValue({ ...VIOLET, daya: null });
    db.dayaWorkSession.findFirst.mockReset().mockResolvedValue(null);
    await expect(completeCharacter('v', GM)).rejects.toThrow(/not born yet/);
  });

  it('a sketch counts as born (the deepen-later hook)', async () => {
    db.character.findUnique.mockResolvedValue({ ...VIOLET, genesisTier: 'SKETCH', daya: null, data: JSON.stringify({ backstory: { backstory: 'A grumpy innkeeper.' }, identity: { age: 50 } }) });
    db.dayaWorkSession.findFirst.mockReset().mockResolvedValue(null);
    detect.mockResolvedValue(new Set(['AGE', 'APPEARANCE', 'WORLD', 'MEMORIES', 'VINES']));
    const r = await completeCharacter('v', GM);
    expect(r.stages).toEqual(['AGE', 'APPEARANCE', 'WORLD', 'MEMORIES', 'VINES']);
    expect(open.mock.calls[0][0].plan).toContain('A grumpy innkeeper.');
  });
});
