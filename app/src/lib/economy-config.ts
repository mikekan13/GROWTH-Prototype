/**
 * Tunable economy constants (T17+).
 *
 * Numbers here are GUESSTIMATES pending a balancing pass (ruling
 * 2026-07-10) — that is exactly why they live in one module instead of
 * being scattered through seeds and tools. Nothing here may create KRMA:
 * these are transfer sizes and thresholds, always executed through the
 * ledger (INV-13/14).
 */

/** JEWL's genesis endowment — Primary-tier, billion-tier wallet
 *  (per [[jewl-is-the-interface-2026-06-15]]). Drawn from the Balance
 *  reserve at seed time; mistake-bounty payouts drain from it. */
export const JEWL_GENESIS_ENDOWMENT = BigInt('1000000000'); // 1B KRMA

/** Dev-only grants used by seed-test-data.ts (Terminal reserve → wallets). */
export const DEV_WATCHER_GRANT = BigInt(100_000);
export const DEV_CAMPAIGN_GRANT = BigInt(50_000);

/** Default Prime campaign wallet float (fund-prime-campaign.ts top-up target). */
export const PRIME_CAMPAIGN_FLOAT = BigInt(100_000);

/** Declining a Nectar converts it to raw KRMA into max Frequency minus this
 *  tax (ruling r-2026-06-09 series — decline tax ~10%). */
export const NECTAR_DECLINE_TAX_RATE = 0.10;

/** Blueprint decay sweep window (T31 — blueprint.unused_for_90d). */
export const BLUEPRINT_DECAY_WINDOW_DAYS = 90;
