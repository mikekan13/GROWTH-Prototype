/**
 * U2c-2 — the table wrappers around the split loop: same gates and the same
 * graceful states as converseWithEntity. The loop itself is mocked here (it
 * has its own tests in ensemble-split.test.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const world = vi.hoisted(() => ({
  character: { id: 'mara' } as { id: string } | null,
  entity: { status: 'ACTIVE' } as { status: string } | null,
  listen: vi.fn(),
  answer: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: { findUnique: vi.fn(async () => world.character) },
    dayaEntity: { findUnique: vi.fn(async () => world.entity) },
  },
}));
vi.mock('@/daya/ensemble', () => ({ listenAtTable: world.listen, answerAsk: world.answer }));
vi.mock('./l1-warm', () => ({ warmL1: vi.fn() }));

import { listenToTable, answerAtTable } from './conversation';
import { DayaTierUnavailableError, DayaWarmingTimeoutError } from './model-client';

const stimulus = { source: 'perception' as const, content: 'The door bangs open.' };
const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.DAYA_ENABLED = 'enabled';
  world.character = { id: 'mara' };
  world.entity = { status: 'ACTIVE' };
  world.listen.mockReset();
  world.answer.mockReset();
});
afterEach(() => {
  process.env = { ...savedEnv };
});

describe('listenToTable / answerAtTable — gates', () => {
  it('a player cannot drive a being', async () => {
    await expect(listenToTable('mara', 'TRAILBLAZER', stimulus)).rejects.toThrow(/GM\/ADMIN only/);
    await expect(answerAtTable('mara', 'TRAILBLAZER', { kind: 'turn' })).rejects.toThrow(/GM\/ADMIN only/);
    expect(world.listen).not.toHaveBeenCalled();
    expect(world.answer).not.toHaveBeenCalled();
  });
  it('an unknown character is an error, not a quiet miss', async () => {
    world.character = null;
    await expect(listenToTable('nobody', 'WATCHER', stimulus)).rejects.toThrow(/Character not found/);
  });
  it('the harness switched off reports disabled and runs nothing', async () => {
    delete process.env.DAYA_ENABLED;
    expect(await listenToTable('mara', 'WATCHER', stimulus)).toEqual({ status: 'disabled' });
    expect(await answerAtTable('mara', 'WATCHER', { kind: 'turn' })).toEqual({ status: 'disabled' });
    expect(world.listen).not.toHaveBeenCalled();
  });
  it('a being that is not awake reports dormant', async () => {
    world.entity = { status: 'DORMANT' };
    expect(await listenToTable('mara', 'WATCHER', stimulus)).toEqual({ status: 'dormant' });
    world.entity = null;
    expect(await answerAtTable('mara', 'ADMIN', { kind: 'turn' })).toEqual({ status: 'dormant' });
  });
});

describe('listenToTable / answerAtTable — outcomes', () => {
  it('passes the stretch through and hands back what the listen returned', async () => {
    const listened = { status: 'listened', memoryEntryId: 'mem-1', innerUpdated: true, timings: {} };
    world.listen.mockResolvedValue(listened);
    expect(await listenToTable('mara', 'WATCHER', stimulus)).toEqual({ status: 'ok', listened });
    expect(world.listen).toHaveBeenCalledWith('mara', stimulus, {});
  });
  it('a stretch an answer took over comes back as null, still ok', async () => {
    world.listen.mockResolvedValue(null);
    expect(await listenToTable('mara', 'WATCHER', stimulus)).toEqual({ status: 'ok', listened: null });
  });
  it('passes the ask and the event listener through', async () => {
    const answer = { utteranceId: 'u1', action: { kind: 'speak', content: 'Who are you?' } };
    world.answer.mockResolvedValue(answer);
    const onEvent = vi.fn();
    expect(await answerAtTable('mara', 'WATCHER', { kind: 'spoken', by: 'Oren', text: 'You the pilot?' }, { onEvent })).toEqual({ status: 'ok', answer });
    expect(world.answer).toHaveBeenCalledWith('mara', { kind: 'spoken', by: 'Oren', text: 'You the pilot?' }, { onEvent });
  });
  it('a cold lane reads as warming, an unconfigured one as offline — never a raw error', async () => {
    world.answer.mockRejectedValue(new DayaWarmingTimeoutError('L1', 240_000));
    expect(await answerAtTable('mara', 'WATCHER', { kind: 'turn' })).toMatchObject({ status: 'warming', detail: expect.stringContaining('warming') });
    world.answer.mockRejectedValue(new DayaTierUnavailableError('L1', 'DAYA_L1_URL not configured'));
    expect(await answerAtTable('mara', 'WATCHER', { kind: 'turn' })).toMatchObject({ status: 'core_offline' });
    world.listen.mockRejectedValue(new DayaWarmingTimeoutError('L1', 240_000));
    expect(await listenToTable('mara', 'WATCHER', stimulus)).toMatchObject({ status: 'warming' });
  });
  it('any other failure surfaces', async () => {
    world.answer.mockRejectedValue(new Error('database is locked'));
    await expect(answerAtTable('mara', 'WATCHER', { kind: 'turn' })).rejects.toThrow('database is locked');
  });
});
