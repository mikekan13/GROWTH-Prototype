import 'server-only';

/**
 * GM Subscription KRMA Drip — anti-frontloading bell curve.
 *
 * Locked Mike 2026-05-19. Intent: training wheels. Heavy early-to-mid KRMA
 * support while the GM builds their world, tapering to a sustaining baseline
 * once the GM's own creations generate enough KRMA. The drip never reaches
 * zero — established GMs keep receiving 3,000 KRMA/month indefinitely.
 *
 * Schedule:
 *   - Lump on subscribe: 15,000 KRMA (`SUBSCRIBE_LUMP`).
 *   - Month 1: 2,500 KRMA.
 *   - Months 2–11: linear ramp 2,500 → 10,000.
 *   - Month 12: 10,000 KRMA (the peak).
 *   - Months 13–35: linear taper 10,000 → 3,000.
 *   - Month 36+: steady 3,000 KRMA/month indefinitely.
 *
 * Total over the 10-year meta campaign: ~480,000 KRMA lifetime drip.
 *
 * These are BETA STARTING VALUES — expect to tune through beta.
 */

export const SUBSCRIBE_LUMP = 15_000;
const RAMP_START = 2_500;
const PEAK = 10_000;
const STEADY = 3_000;

/**
 * KRMA owed for the Nth month of subscription (1-indexed). Does NOT include
 * the lump-sum on subscribe.
 *
 * Months <= 0 yield 0. Months 1+ return the curve value.
 */
export function monthlyDrip(monthsSinceSubscribe: number): number {
  if (monthsSinceSubscribe < 1) return 0;
  if (monthsSinceSubscribe === 1) return RAMP_START;

  // Months 2-11: linear ramp 2,500 → 10,000 across 10 steps (months 2..11),
  // so the increment between consecutive months is (PEAK - RAMP_START) / 10.
  if (monthsSinceSubscribe <= 11) {
    const stepsFromMonth1 = monthsSinceSubscribe - 1;
    const incrementPerStep = (PEAK - RAMP_START) / 10;
    return Math.round(RAMP_START + stepsFromMonth1 * incrementPerStep);
  }

  // Month 12: peak.
  if (monthsSinceSubscribe === 12) return PEAK;

  // Months 13-35: linear taper 10,000 → 3,000 across 23 steps (month 13 to 35).
  if (monthsSinceSubscribe <= 35) {
    const stepsFromMonth12 = monthsSinceSubscribe - 12;
    const totalSteps = 23;
    const decrementPerStep = (PEAK - STEADY) / totalSteps;
    return Math.round(PEAK - stepsFromMonth12 * decrementPerStep);
  }

  // Month 36+: steady.
  return STEADY;
}

/**
 * Total KRMA paid out through the end of month N — handy for forecasts.
 * Includes the lump.
 */
export function cumulativeDrip(monthsSinceSubscribe: number): number {
  let total = SUBSCRIBE_LUMP;
  for (let m = 1; m <= monthsSinceSubscribe; m++) {
    total += monthlyDrip(m);
  }
  return total;
}
