/**
 * Born → ACTIVE (perf pass 2026-10-12): a finished genesis wakes its
 * character so the table loop can voice her.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, wrap } = vi.hoisted(() => ({
  db: {
    dayaWorkSession: { findUnique: vi.fn(), update: vi.fn() },
    dayaEntity: { update: vi.fn() },
  },
  wrap: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('@/daya/authoring', () => ({ wrapCharacterAsDaya: (...a: unknown[]) => wrap(...a) }));
vi.mock('./character-genesis-progress', () => ({
  parseGenesisGoal: (g: string) => {
    const m = /^Character genesis: (.+?) \[([^\]\s]+)\]/.exec(g);
    return m ? { name: m[1], characterId: m[2] } : null;
  },
  announceGenesisStatus: vi.fn(async () => null),
}));

import { updateWorkSession } from './daya-work-session';
import { awakenGenesisCharacter } from './character-genesis-born';

const GOAL = 'Character genesis: Violet [char_v] — gestate the person';

beforeEach(() => {
  vi.clearAllMocks();
  wrap.mockResolvedValue({ entityId: 'e1', status: 'DORMANT' });
  db.dayaEntity.update.mockResolvedValue({ status: 'ACTIVE' });
});

describe('awakenGenesisCharacter', () => {
  it('wraps the character (idempotent) and sets her DayaEntity ACTIVE', async () => {
    await expect(awakenGenesisCharacter(GOAL)).resolves.toBe('char_v');
    expect(wrap).toHaveBeenCalledWith('char_v', 'GODHEAD');
    expect(db.dayaEntity.update).toHaveBeenCalledWith({ where: { characterId: 'char_v' }, data: { status: 'ACTIVE' } });
  });

  it('ignores a goal that names no character', async () => {
    await expect(awakenGenesisCharacter('Build the tavern')).resolves.toBeNull();
    expect(wrap).not.toHaveBeenCalled();
  });
});

describe('updateWorkSession → done on a genesis', () => {
  // Born comes after the LAST completion stage (VINES, 2026-10-12).
  const row = { id: 's1', campaignId: 'c1', goal: GOAL, status: 'active', stage: 'VINES', progress: '[]' };

  it('Born sets the character ACTIVE', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue(row);
    db.dayaWorkSession.update.mockResolvedValue({ ...row, status: 'done' });
    await updateWorkSession({ sessionId: 's1', status: 'done', progressNote: 'born' });
    expect(db.dayaEntity.update).toHaveBeenCalledWith({ where: { characterId: 'char_v' }, data: { status: 'ACTIVE' } });
  });

  it('a wake failure never blocks Born', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.dayaWorkSession.findUnique.mockResolvedValue(row);
    db.dayaWorkSession.update.mockResolvedValue({ ...row, status: 'done' });
    wrap.mockRejectedValue(new Error('db busy'));
    await expect(updateWorkSession({ sessionId: 's1', status: 'done' })).resolves.toMatchObject({ status: 'done' });
  });

  it('a non-genesis session finishing wakes nobody', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ ...row, goal: 'Build the tavern' });
    db.dayaWorkSession.update.mockResolvedValue({ ...row, status: 'done' });
    await updateWorkSession({ sessionId: 's1', status: 'done' });
    expect(wrap).not.toHaveBeenCalled();
  });
});
