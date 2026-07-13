import { describe, it, expect } from 'vitest';
import { monthlyDrip, cumulativeDrip, DEFAULT_DRIP_CONFIG } from './subscription-drip';

/**
 * INV-17 AMENDED (T06): the drip curve became config-driven. The default config
 * must reproduce the historical hard-coded curve byte-for-byte; a custom config
 * must change the output. This is the same parity oracle as
 * scripts/test-drip-parity.ts, run under the harness.
 */

// The pre-T06 hard-coded formula, verbatim.
function oldMonthly(m: number): number {
  const RAMP_START = 2_500, PEAK = 10_000, STEADY = 3_000;
  if (m < 1) return 0;
  if (m === 1) return RAMP_START;
  if (m <= 11) return Math.round(RAMP_START + (m - 1) * ((PEAK - RAMP_START) / 10));
  if (m === 12) return PEAK;
  if (m <= 35) return Math.round(PEAK - (m - 12) * ((PEAK - STEADY) / 23));
  return STEADY;
}
function oldCumulative(m: number): number {
  let t = 15_000;
  for (let i = 1; i <= m; i++) t += oldMonthly(i);
  return t;
}

describe('subscription drip parity + config (INV-17 AMENDED)', () => {
  it('default config reproduces the historical monthly curve (months 0..40)', () => {
    for (let m = 0; m <= 40; m++) {
      expect(monthlyDrip(m)).toBe(oldMonthly(m));
    }
  });

  it('default config reproduces the historical cumulative curve', () => {
    for (let m = 0; m <= 40; m++) {
      expect(cumulativeDrip(m)).toBe(oldCumulative(m));
    }
  });

  it('default lump = 15,000', () => {
    expect(DEFAULT_DRIP_CONFIG.subscribeLump).toBe(15_000);
  });

  it('a custom config changes the curve deterministically', () => {
    const cfg = { ...DEFAULT_DRIP_CONFIG, peak: 20_000, steady: 6_000 };
    expect(monthlyDrip(12, cfg)).toBe(20_000);
    expect(monthlyDrip(40, cfg)).toBe(6_000);
    // ...without mutating the default.
    expect(monthlyDrip(12)).toBe(10_000);
  });
});
