/**
 * maturityFlags — the ONE controlled vocabulary (Mike rulings 2026-08-04,
 * 2026-08-19, 2026-10-12). Audience control = flags, never content avoidance.
 * Extend by ruling only. Read by the forge Zod schemas, the Workshop ⚠ chips
 * and JEWL's flag-honestly law (prompt v3).
 *
 * `sexual` (2026-10-12): lurid or strong sexual content. Any campaign content
 * carrying it makes the campaign adult-only (services/maturity.ts).
 */
export const MATURITY_FLAGS = [
  'mental-health', 'violence', 'substance', 'trauma', 'illness-detail', 'sexual',
] as const;

export type MaturityFlag = (typeof MATURITY_FLAGS)[number];

/** The flag that makes a table 18+. */
export const ADULT_ONLY_FLAG: MaturityFlag = 'sexual';

/** Workshop chip label per flag. */
export function maturityFlagLabel(flag: string): string {
  return flag === ADULT_ONLY_FLAG ? 'sexual · 18+' : flag;
}
