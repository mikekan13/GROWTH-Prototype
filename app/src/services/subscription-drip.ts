import 'server-only';

/**
 * GM Subscription KRMA Drip — anti-frontloading bell curve.
 *
 * Intent: training wheels. Heavy early-to-mid KRMA support while the GM builds
 * their world, tapering to a sustaining baseline once the GM's own creations
 * generate enough KRMA. The drip never reaches zero — established GMs keep
 * receiving the steady amount indefinitely.
 *
 * Default schedule (the seed values):
 *   - Lump on subscribe: 15,000 KRMA.
 *   - Month 1: 2,500 KRMA.
 *   - Months 2–11: linear ramp 2,500 → 10,000.
 *   - Month 12: 10,000 KRMA (the peak).
 *   - Months 13–35: linear taper 10,000 → 3,000.
 *   - Month 36+: steady 3,000 KRMA/month indefinitely.
 *
 * These numbers are GUESSTIMATES (ruling 2026-07-10 / INV-17 AMENDED): the real
 * curve is emergent and experimental. They are NO LONGER hard-coded canon — the
 * anchors below are the DEFAULTS, and an ADMIN can override them at runtime via
 * `EconomyConfig` (see `services/economy-config.ts`). Callers that want the
 * live-tunable values should load the config and pass it in; omitting the
 * config argument reproduces the historical default behavior exactly.
 */

/** The tunable anchors of the drip curve. All amounts in KRMA; months 1-indexed. */
export interface DripConfig {
  /** One-time KRMA granted the moment a GM subscribes. */
  subscribeLump: number;
  /** Month-1 drip; start of the ramp. */
  rampStart: number;
  /** Peak monthly drip (reached at `peakMonth`). */
  peak: number;
  /** Steady monthly drip from `taperEndMonth + 1` onward, forever. */
  steady: number;
  /** Last month of the ramp (ramp reaches `peak` here). */
  rampEndMonth: number;
  /** Month the curve sits at `peak`. */
  peakMonth: number;
  /** Last month of the taper (taper reaches `steady` here). */
  taperEndMonth: number;
}

/** The historical hard-coded schedule, now the seed defaults. */
export const DEFAULT_DRIP_CONFIG: DripConfig = {
  subscribeLump: 15_000,
  rampStart: 2_500,
  peak: 10_000,
  steady: 3_000,
  rampEndMonth: 11,
  peakMonth: 12,
  taperEndMonth: 35,
};

/**
 * Back-compat export — the default lump. Live allocation paths should read the
 * lump from `getDripConfig()` instead; this keeps display/legacy callers working.
 */
export const SUBSCRIBE_LUMP = DEFAULT_DRIP_CONFIG.subscribeLump;

/**
 * KRMA owed for the Nth month of subscription (1-indexed). Does NOT include
 * the lump-sum on subscribe. Months <= 0 yield 0.
 *
 * Pass a `DripConfig` to use live-tuned values; omit it for the default curve.
 */
export function monthlyDrip(monthsSinceSubscribe: number, config: DripConfig = DEFAULT_DRIP_CONFIG): number {
  const { rampStart, peak, steady, rampEndMonth, peakMonth, taperEndMonth } = config;
  if (monthsSinceSubscribe < 1) return 0;
  if (monthsSinceSubscribe === 1) return rampStart;

  // Months 2..rampEndMonth: linear ramp rampStart → peak. The increment per
  // month is (peak - rampStart) / (rampEndMonth - 1) so that month
  // `rampEndMonth` lands exactly on `peak`.
  if (monthsSinceSubscribe <= rampEndMonth) {
    const incrementPerStep = (peak - rampStart) / (rampEndMonth - 1);
    return Math.round(rampStart + (monthsSinceSubscribe - 1) * incrementPerStep);
  }

  // Plateau between the ramp end and the peak month (inclusive).
  if (monthsSinceSubscribe <= peakMonth) return peak;

  // Months peakMonth+1..taperEndMonth: linear taper peak → steady, landing on
  // `steady` exactly at `taperEndMonth`.
  if (monthsSinceSubscribe <= taperEndMonth) {
    const decrementPerStep = (peak - steady) / (taperEndMonth - peakMonth);
    return Math.round(peak - (monthsSinceSubscribe - peakMonth) * decrementPerStep);
  }

  // taperEndMonth+1 onward: steady, forever.
  return steady;
}

/**
 * Total KRMA paid out through the end of month N — handy for forecasts.
 * Includes the lump.
 */
export function cumulativeDrip(monthsSinceSubscribe: number, config: DripConfig = DEFAULT_DRIP_CONFIG): number {
  let total = config.subscribeLump;
  for (let m = 1; m <= monthsSinceSubscribe; m++) {
    total += monthlyDrip(m, config);
  }
  return total;
}
