import { describe, it, expect } from 'vitest';
import { burnMultiplier } from './burn';

/**
 * INV-19: Burn is anti-deflationary — scaledCost = baseCost × (1 +
 * burnSinkBalance / 50_000). burnMultiplier is the pure multiplier term.
 * (The global 5B cap that disables Burn entirely is enforced in executeBurn,
 * which is DB-bound and out of scope for this pure test.)
 */
describe('burn scaling (INV-19)', () => {
  it('multiplier is 1 with an empty burn sink', () => {
    expect(burnMultiplier(0n)).toBe(1);
  });

  it('multiplier is 2 when the sink holds one scale-constant (50,000)', () => {
    expect(burnMultiplier(50_000n)).toBe(2);
  });

  it('multiplier grows linearly toward the 5B burn cap', () => {
    // 1 + 5,000,000,000 / 50,000 = 1 + 100,000
    expect(burnMultiplier(5_000_000_000n)).toBe(100_001);
  });

  it('scaledCost = round(baseCost × multiplier), floored at 1', () => {
    const mult = burnMultiplier(50_000n); // 2
    expect(Math.max(1, Math.round(10 * mult))).toBe(20);
    // A tiny cost at multiplier 1 never drops below 1.
    expect(Math.max(1, Math.round(0.4 * burnMultiplier(0n)))).toBe(1);
  });
});
