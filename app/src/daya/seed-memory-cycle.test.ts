/** A seeded memory lands at the age she lived it (2026-10-17: every genesis memory had landed at "now"). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
const { seedMemoryCycle } = await import('./authoring');

describe('seedMemoryCycle', () => {
  it('birth −25 + age 4 → cycle −21; an explicit cycle wins; no age → now', () => {
    expect(seedMemoryCycle({ atAge: 4 }, -25, 0)).toBe(-21);
    expect(seedMemoryCycle({ atAge: 19, cycle: -3 }, -25, 0)).toBe(-3);
    expect(seedMemoryCycle({}, -25, 0)).toBe(0);
    expect(seedMemoryCycle({ atAge: 4 }, null, 0)).toBe(0);
  });
});
