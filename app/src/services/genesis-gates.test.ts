/** Player gates (2026-10-16): APPEARANCE / PORTRAIT wait at the designer, no model call. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, detect, update, kick } = vi.hoisted(() => ({
  db: { dayaWorkSession: { findUnique: vi.fn(), findMany: vi.fn() } },
  detect: vi.fn(),
  update: vi.fn(async (..._a: unknown[]) => undefined),
  kick: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('./genesis-stages', () => ({ detectMissingStages: (...a: unknown[]) => detect(...a) }));
vi.mock('./daya-work-session', () => ({ updateWorkSession: (...a: unknown[]) => update(...a) }));
vi.mock('@/ai/copilot/work-loop', () => ({ kickWorkLoop: kick }));

import { holdOrPassGate, reopenGenesisGates } from './genesis-gates';
import { gateBlockedReason } from '@/lib/genesis-stages';

const GOAL = 'Character genesis: Violet [v] — complete the born character: APPEARANCE → WORLD.';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('holdOrPassGate', () => {
  it('holds an active session at APPEARANCE with the gate reason when the look is not approved', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', goal: GOAL, stage: 'APPEARANCE', status: 'active', blockedReason: null });
    detect.mockResolvedValue(new Set(['APPEARANCE', 'WORLD']));
    expect(await holdOrPassGate('s1')).toBe('held');
    expect(update).toHaveBeenCalledWith({ sessionId: 's1', status: 'blocked', blockedReason: gateBlockedReason('APPEARANCE') });
  });
  it('a session already holding stays held without a write', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', goal: GOAL, stage: 'APPEARANCE', status: 'blocked', blockedReason: gateBlockedReason('APPEARANCE') });
    detect.mockResolvedValue(new Set(['APPEARANCE']));
    expect(await holdOrPassGate('s1')).toBe('held');
    expect(update).not.toHaveBeenCalled();
  });
  it('passes the gate (done → the walk moves on) once the look is approved', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', goal: GOAL, stage: 'APPEARANCE', status: 'active', blockedReason: null });
    detect.mockResolvedValue(new Set(['WORLD']));
    expect(await holdOrPassGate('s1')).toBe('passed');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1', status: 'done' }));
  });
  it('ignores non-gate stages', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', goal: GOAL, stage: 'WORLD', status: 'active' });
    expect(await holdOrPassGate('s1')).toBe('skipped');
  });
});

describe('reopenGenesisGates (the designer saved / the portrait locked)', () => {
  it('reactivates a held gate whose evidence now exists and kicks the loop', async () => {
    db.dayaWorkSession.findMany.mockResolvedValue([
      { id: 's1', goal: GOAL, stage: 'APPEARANCE', status: 'blocked', blockedReason: gateBlockedReason('APPEARANCE') },
      { id: 's2', goal: GOAL, stage: 'WORLD', status: 'blocked', blockedReason: 'waiting on the GM — prods [p1]' },
    ]);
    detect.mockResolvedValue(new Set(['WORLD']));
    expect(await reopenGenesisGates('v')).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1', status: 'active' }));
    expect(kick).toHaveBeenCalled();
  });
  it('leaves a gate held while the evidence is still missing', async () => {
    db.dayaWorkSession.findMany.mockResolvedValue([{ id: 's1', goal: GOAL, stage: 'APPEARANCE', status: 'blocked', blockedReason: gateBlockedReason('APPEARANCE') }]);
    detect.mockResolvedValue(new Set(['APPEARANCE']));
    expect(await reopenGenesisGates('v')).toBe(0);
    expect(kick).not.toHaveBeenCalled();
  });
});
