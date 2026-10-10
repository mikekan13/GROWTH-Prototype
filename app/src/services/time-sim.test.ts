import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STANDARD_CALENDAR, localUnitsToCycles, secondsToCycles, cycleToLocalDate } from '@/types/time';

// In-memory campaign row; prisma is mocked (no DB writes).
const db = { currentCycle: 0 };
const writeHistory = vi.fn(async (..._args: unknown[]) => ({ eventGroupId: 'g', count: 1 }));
const sweepExpiredBlossoms = vi.fn(async (..._args: unknown[]) => ({ expired: [] as Array<{ characterId: string; characterName: string; name: string; returned: number }> }));
const sweepManaResidues = vi.fn(async (..._args: unknown[]) => ({ decayed: [], fadedOut: 0 }));

vi.mock('@/lib/db', () => ({
  prisma: {
    campaign: {
      findUnique: vi.fn(async () => ({ id: 'c1', gmUserId: 'gm', defaultTimescaleId: 'ts1', currentCycle: db.currentCycle })),
      update: vi.fn(async ({ data }: { data: { currentCycle: number | { increment: number } } }) => {
        const c = data.currentCycle;
        db.currentCycle = typeof c === 'number' ? c : db.currentCycle + c.increment;
        return { currentCycle: db.currentCycle };
      }),
    },
    timescale: {
      findUnique: vi.fn(async () => ({ id: 'ts1', campaignId: 'c1', name: 'Standard Reckoning', unitName: 'year', unitsPerMetaCycle: 1, calendar: JSON.stringify(STANDARD_CALENDAR) })),
    },
  },
}));
vi.mock('@/services/history', () => ({ writeHistory: (...a: unknown[]) => writeHistory(...a) }));
vi.mock('@/services/blossom', () => ({ sweepExpiredBlossoms: (...a: unknown[]) => sweepExpiredBlossoms(...a) }));
vi.mock('@/services/mana', () => ({ sweepManaResidues: (...a: unknown[]) => sweepManaResidues(...a) }));

import { advanceClock, advanceClockBySim, flushSimClock, pendingSimSeconds, SIM_CLOCK_FLUSH_SECONDS } from './time';

const STD = { unitsPerMetaCycle: 1, calendar: STANDARD_CALENDAR };
const clockAdvances = () => writeHistory.mock.calls.filter(c => (c[2] as Array<{ type: string }>)[0]?.type === 'clock_advance');

beforeEach(async () => {
  await flushSimClock('c1');
  db.currentCycle = 0;
  writeHistory.mockClear();
  sweepExpiredBlossoms.mockClear();
  sweepManaResidues.mockClear();
});

describe('secondsToCycles — one conversion through the campaign calendar', () => {
  it('3600 s is an hour, 86400 s a day, on the standard calendar', () => {
    expect(secondsToCycles(3600, STD)).toBeCloseTo(localUnitsToCycles(1, 'hour', STD), 15);
    expect(secondsToCycles(86400, STD)).toBeCloseTo(localUnitsToCycles(1, 'day', STD), 15);
  });
  it("a manual 'round' and six sim seconds are the same instant, on any calendar", () => {
    const odd = { unitsPerMetaCycle: 10, calendar: { months: [{ name: 'Long', days: 400 }], hoursPerDay: 30 } };
    expect(localUnitsToCycles(1, 'round', odd)).toBeCloseTo(secondsToCycles(6, odd), 18);
    expect(localUnitsToCycles(1, 'round', STD)).toBeCloseTo(secondsToCycles(6, STD), 18);
  });
  it('a full day of sim seconds lands on the next calendar day', () => {
    expect(cycleToLocalDate(secondsToCycles(86400, STD), { ...STD, unitName: 'year' }).day).toBe(2);
  });
});

describe('advanceClockBySim — the simulation keeps time (ruling 2026-10-07)', () => {
  it('needs no GM: a round resolved for anyone moves the clock at once', async () => {
    const r = await advanceClockBySim('c1', 6, 'Ambush round 1');
    expect(r.currentCycle).toBeCloseTo(secondsToCycles(6, STD), 18);
    expect(db.currentCycle).toBe(r.currentCycle); // readers see the true clock now
    expect(r.flushed).toBe(false);
    expect(clockAdvances()).toHaveLength(0);
    expect(pendingSimSeconds('c1')).toBe(6);
  });

  it('many small advances → one history entry + one sweep pass at the threshold', async () => {
    const rounds = SIM_CLOCK_FLUSH_SECONDS / 6;
    for (let i = 1; i <= rounds; i++) await advanceClockBySim('c1', 6, `Ambush round ${i}`);
    expect(clockAdvances()).toHaveLength(1);
    expect(sweepExpiredBlossoms).toHaveBeenCalledTimes(1);
    expect(sweepManaResidues).toHaveBeenCalledTimes(1);
    // The sweep receives the whole span, so residue fades exactly as if unbatched.
    expect(sweepManaResidues.mock.calls[0][1]).toBeCloseTo(secondsToCycles(SIM_CLOCK_FLUSH_SECONDS, STD), 15);
    expect(sweepExpiredBlossoms.mock.calls[0][1]).toBe(db.currentCycle);
    const entry = (clockAdvances()[0][2] as Array<{ summary: string; details: string }>)[0];
    expect(entry.summary).toMatch(/^1 minute passed in play/);
    expect(entry.details).toContain('(+5 more)');
    expect(pendingSimSeconds('c1')).toBe(0);
  });

  it('flushSimClock writes the partial span (encounter end / bridge) and is a no-op when empty', async () => {
    await advanceClockBySim('c1', 6, 'r1');
    await advanceClockBySim('c1', 6, 'r2');
    const f = await flushSimClock('c1');
    expect(f?.seconds).toBe(12);
    expect(f?.advances).toBe(2);
    expect(clockAdvances()).toHaveLength(1);
    expect(await flushSimClock('c1')).toBeNull();
    expect(clockAdvances()).toHaveLength(1);
  });

  it('one advance over the threshold flushes immediately (a long bridge)', async () => {
    const r = await advanceClockBySim('c1', 30 * 60, 'Continuity bridge');
    expect(r.flushed).toBe(true);
    expect((clockAdvances()[0][2] as Array<{ summary: string }>)[0].summary).toMatch(/^30 minutes passed in play/);
  });

  it('rejects non-positive time', async () => {
    await expect(advanceClockBySim('c1', 0, 'x')).rejects.toThrow();
    await expect(advanceClockBySim('c1', -6, 'x')).rejects.toThrow();
  });
});

describe('manual clock = the override, unchanged', () => {
  it('still refuses a non-GM', async () => {
    await expect(advanceClock('c1', 'player', 'TRAILBLAZER', { amount: 1, unit: 'hour' })).rejects.toThrow(/GM/);
    expect(db.currentCycle).toBe(0);
  });
  it('a GM advance writes its own entry, after flushing pending sim time first', async () => {
    await advanceClockBySim('c1', 6, 'r1');
    const r = await advanceClock('c1', 'gm', 'WATCHER', { amount: 1, unit: 'hour', note: 'override' });
    const entries = clockAdvances().map(c => (c[2] as Array<{ summary: string; actorId?: string }>)[0]);
    expect(entries).toHaveLength(2);
    expect(entries[0].summary).toMatch(/6 seconds passed in play/);
    expect(entries[1].summary).toMatch(/^Time advanced by 1 hour/);
    expect(entries[1].actorId).toBe('gm');
    expect(r.deltaCycles).toBeCloseTo(localUnitsToCycles(1, 'hour', STD), 15);
  });
});
