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
const CACHE_TTL_MS = 30_000;

let dripCache: { config: DripConfig; at: number } | null = null;

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
}
