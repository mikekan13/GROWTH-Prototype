/**
 * The genesis seed-withheld progress note (2026-10-12) — pure, fixed
 * vocabulary only (tone categories + outcome), so the process-only genesis
 * progress payload may carry it. Written by services/genesis-seed-screen
 * after a work cycle whose seed the tone filter withheld or toned; read by
 * services/character-genesis-progress for the overlay's feed line.
 */

export const SEED_WITHHELD_PREFIX = '⚠ seed-withheld:';
const KNOWN: ReadonlySet<string> = new Set(['gore', 'torture', 'sexual', 'sexual-violence', 'minor-sexual']);
const OUTCOMES: ReadonlySet<string> = new Set(['blocked', 'withheld', 'softened']);

export type SeedWithheldOutcome = 'blocked' | 'withheld' | 'softened';

/** The fixed-format progress note. Unknown categories are dropped. */
export function formatSeedWithheldNote(categories: string[], outcome: SeedWithheldOutcome): string {
  const cats = categories.filter((c) => KNOWN.has(c));
  return `${SEED_WITHHELD_PREFIX} ${cats.join('+') || 'unspecified'} (${outcome})`;
}

/** Notes -> structured warnings. Anything not in the fixed format is ignored. */
export function parseSeedWithheldNotes(notes: string[]): Array<{ categories: string[]; outcome: SeedWithheldOutcome }> {
  const out: Array<{ categories: string[]; outcome: SeedWithheldOutcome }> = [];
  const re = /^⚠ seed-withheld: ([a-z+-]+) \((blocked|withheld|softened)\)$/;
  for (const n of notes) {
    const m = re.exec(n);
    if (!m || !OUTCOMES.has(m[2])) continue;
    out.push({ categories: m[1].split('+').filter((c) => KNOWN.has(c) || c === 'unspecified'), outcome: m[2] as SeedWithheldOutcome });
  }
  return out;
}
