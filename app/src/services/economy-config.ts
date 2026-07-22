import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { DEFAULT_DRIP_CONFIG, type DripConfig } from './subscription-drip';

/**
 * ADMIN-tunable economy constants, backed by the `EconomyConfig` table.
 *
 * Numbers are guesstimates pending a balancing pass (ruling 2026-07-10 /
 * INV-17 AMENDED). This service is the single read/write point so the drip
 * curve (and future tunables) can be changed at runtime without a deploy.
 *
 * NOTHING here creates KRMA — these are transfer sizes and thresholds; every
 * actual movement still runs through the ledger (INV-13/14).
 *
 * Absence is safe: when a key has no row, code defaults are returned. Values
 * are cached in-process for a short TTL; `setDripConfig` busts the cache.
 */

const DRIP_KEY = 'drip';
const MISTAKE_BOUNTY_KEY = 'mistakeBounty';
const MAGIC_CASTING_KEY = 'magicCasting';
const CACHE_TTL_MS = 30_000;

let dripCache: { config: DripConfig; at: number } | null = null;
let bountyCache: { config: MistakeBountyConfig; at: number } | null = null;
let magicCache: { config: MagicCastingConfig; at: number } | null = null;

/**
 * JEWL mistake-bounty payout sizes by severity, in whole KRMA. Anchors per
 * [[jewl-is-the-interface-2026-06-15]]: trivial fraction of a billion-tier
 * wallet, so JEWL approaching perfection only slowly drains it. Guesstimates
 * pending a balancing pass — that is exactly why they live here (INV-121).
 */
export interface MistakeBountyConfig {
  minor: number;
  major: number;
  critical: number;
}

export const DEFAULT_MISTAKE_BOUNTY_CONFIG: MistakeBountyConfig = {
  minor: 10,
  major: 100,
  critical: 1000,
};

/** Partial patch schema — every anchor optional, all non-negative integers,
 *  breakpoints ordered. Validated at the service boundary (Part B §5). */
export const dripConfigPatchSchema = z
  .object({
    subscribeLump: z.number().int().min(0).optional(),
    rampStart: z.number().int().min(0).optional(),
    peak: z.number().int().min(0).optional(),
    steady: z.number().int().min(0).optional(),
    rampEndMonth: z.number().int().min(2).optional(),
    peakMonth: z.number().int().min(2).optional(),
    taperEndMonth: z.number().int().min(2).optional(),
  })
  .strict();

export type DripConfigPatch = z.infer<typeof dripConfigPatchSchema>;

/** Current drip config: DB row merged over code defaults, or defaults if absent. */
export async function getDripConfig(): Promise<DripConfig> {
  if (dripCache && Date.now() - dripCache.at < CACHE_TTL_MS) return dripCache.config;
  const row = await prisma.economyConfig.findUnique({ where: { key: DRIP_KEY } });
  let config: DripConfig = DEFAULT_DRIP_CONFIG;
  if (row) {
    try {
      config = { ...DEFAULT_DRIP_CONFIG, ...(JSON.parse(row.value) as Partial<DripConfig>) };
    } catch {
      // Corrupt row → fall back to defaults rather than break the economy.
      config = DEFAULT_DRIP_CONFIG;
    }
  }
  assertCoherent(config);
  dripCache = { config, at: Date.now() };
  return config;
}

/** Apply an ADMIN patch to the drip config, persist it, and bust the cache. */
export async function setDripConfig(patch: DripConfigPatch, updatedBy?: string): Promise<DripConfig> {
  const current = await getDripConfig();
  const next: DripConfig = { ...current, ...patch };
  assertCoherent(next);
  await prisma.economyConfig.upsert({
    where: { key: DRIP_KEY },
    create: { key: DRIP_KEY, value: JSON.stringify(next), updatedBy: updatedBy ?? null },
    update: { value: JSON.stringify(next), updatedBy: updatedBy ?? null },
  });
  dripCache = { config: next, at: Date.now() };
  return next;
}

// ── Mistake-bounty config ──

export const mistakeBountyPatchSchema = z
  .object({
    minor: z.number().int().min(0).optional(),
    major: z.number().int().min(0).optional(),
    critical: z.number().int().min(0).optional(),
  })
  .strict();

export type MistakeBountyPatch = z.infer<typeof mistakeBountyPatchSchema>;

/** Current bounty config: DB row merged over code defaults, or defaults if absent. */
export async function getMistakeBountyConfig(): Promise<MistakeBountyConfig> {
  if (bountyCache && Date.now() - bountyCache.at < CACHE_TTL_MS) return bountyCache.config;
  const row = await prisma.economyConfig.findUnique({ where: { key: MISTAKE_BOUNTY_KEY } });
  let config: MistakeBountyConfig = DEFAULT_MISTAKE_BOUNTY_CONFIG;
  if (row) {
    try {
      config = { ...DEFAULT_MISTAKE_BOUNTY_CONFIG, ...(JSON.parse(row.value) as Partial<MistakeBountyConfig>) };
    } catch {
      config = DEFAULT_MISTAKE_BOUNTY_CONFIG;
    }
  }
  bountyCache = { config, at: Date.now() };
  return config;
}

/**
 * Resolve the pending bounty for a severity, as BigInt KRMA. Config is stored
 * as plain numbers (JSON-safe); the ledger works in BigInt (INV-13).
 */
export async function getMistakeBountyAmount(
  severity: 'minor' | 'major' | 'critical',
): Promise<bigint> {
  const config = await getMistakeBountyConfig();
  return BigInt(config[severity]);
}

/** Apply an ADMIN patch to the bounty config, persist it, and bust the cache. */
export async function setMistakeBountyConfig(
  patch: MistakeBountyPatch,
  updatedBy?: string,
): Promise<MistakeBountyConfig> {
  const current = await getMistakeBountyConfig();
  const next: MistakeBountyConfig = { ...current, ...patch };
  await prisma.economyConfig.upsert({
    where: { key: MISTAKE_BOUNTY_KEY },
    create: { key: MISTAKE_BOUNTY_KEY, value: JSON.stringify(next), updatedBy: updatedBy ?? null },
    update: { value: JSON.stringify(next), updatedBy: updatedBy ?? null },
  });
  bountyCache = { config: next, at: Date.now() };
  return next;
}

/**
 * Casting constants (r-2026-07-22-01 / -02), ADMIN-tunable test values:
 *   - manaPerKrma: how much mana one KRMA buys. Mike: "set conversion... around
 *     4 mana = 1 KRMA" but "I don't know what this will be without testing."
 *   - systemEngagementDR: the DR at/above which a cast requires godhead/Terminal
 *     oversight (Casting_Methods L6 "Heroic"). Mike: "a threshold where the
 *     godheads get involved... that power level may change but a good place to
 *     start testing." Starts at 50.
 * Both deliberately live here so playtest can move them without a deploy.
 */
export interface MagicCastingConfig {
  manaPerKrma: number;
  systemEngagementDR: number;
}

export const DEFAULT_MAGIC_CASTING_CONFIG: MagicCastingConfig = {
  manaPerKrma: 4,
  systemEngagementDR: 50,
};

export const magicCastingPatchSchema = z
  .object({
    manaPerKrma: z.number().int().min(1).optional(),
    systemEngagementDR: z.number().int().min(1).optional(),
  })
  .strict();

export type MagicCastingPatch = z.infer<typeof magicCastingPatchSchema>;

/** Current casting config: DB row merged over code defaults, or defaults if absent. */
export async function getMagicCastingConfig(): Promise<MagicCastingConfig> {
  if (magicCache && Date.now() - magicCache.at < CACHE_TTL_MS) return magicCache.config;
  const row = await prisma.economyConfig.findUnique({ where: { key: MAGIC_CASTING_KEY } });
  let config: MagicCastingConfig = DEFAULT_MAGIC_CASTING_CONFIG;
  if (row) {
    try {
      config = { ...DEFAULT_MAGIC_CASTING_CONFIG, ...(JSON.parse(row.value) as Partial<MagicCastingConfig>) };
    } catch {
      config = DEFAULT_MAGIC_CASTING_CONFIG;
    }
  }
  magicCache = { config, at: Date.now() };
  return config;
}

/** Apply an ADMIN patch to the casting config, persist it, and bust the cache. */
export async function setMagicCastingConfig(
  patch: MagicCastingPatch,
  updatedBy?: string,
): Promise<MagicCastingConfig> {
  const current = await getMagicCastingConfig();
  const next: MagicCastingConfig = { ...current, ...patch };
  await prisma.economyConfig.upsert({
    where: { key: MAGIC_CASTING_KEY },
    create: { key: MAGIC_CASTING_KEY, value: JSON.stringify(next), updatedBy: updatedBy ?? null },
    update: { value: JSON.stringify(next), updatedBy: updatedBy ?? null },
  });
  magicCache = { config: next, at: Date.now() };
  return next;
}

/** Ensure the curve breakpoints are monotonically ordered so the formula is well-defined. */
function assertCoherent(c: DripConfig): void {
  if (c.rampEndMonth > c.peakMonth || c.peakMonth > c.taperEndMonth) {
    throw new Error(
      `Incoherent drip breakpoints: expected rampEndMonth (${c.rampEndMonth}) <= peakMonth (${c.peakMonth}) <= taperEndMonth (${c.taperEndMonth})`,
    );
  }
  if (c.rampEndMonth < 2 || c.peakMonth < 2 || c.taperEndMonth <= c.peakMonth) {
    throw new Error('Drip breakpoints out of range: need rampEndMonth>=2, peakMonth>=2, taperEndMonth>peakMonth');
  }
}

/** Test hook — clears the in-process cache. */
export function __clearEconomyConfigCache(): void {
  dripCache = null;
  bountyCache = null;
}
