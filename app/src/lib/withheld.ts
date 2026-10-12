/**
 * Withheld content (lawfulness unit 8b, Mike 2026-10-12). Pure, no DB.
 *
 * Blocked INPUT is still stored — "flagged for a human moderator to inspect"
 * needs a row for the flag to point at — but the row is WITHHELD:
 *
 *   - `contentClass = 'real'` (the wall: never reaches a cloud lane), and
 *   - `withheld: true` in the row's `actions` JSON (no schema change).
 *
 * Every reader skips or masks a withheld row: it never renders to anyone but
 * as `WITHHELD_STRING` (and the history is per-user, so only to its sender),
 * never enters the classifier window, never reaches any model. Only ADMIN
 * reads the original, through the flag's pointer (`getFlagWithReferent`).
 */

/** The fixed string a caller substitutes for blocked content. No detail, nothing derived. */
export const WITHHELD_STRING = '[withheld: this content cannot be processed]';

/** The `actions` JSON for a withheld row: the caller's own fields + the marker. */
export function withheldActions(base: Record<string, unknown>, categories: string[]): string {
  return JSON.stringify({ ...base, withheld: true, lawfulness: [...categories] });
}

/** True when a row's `actions` JSON carries the withheld marker. */
export function isWithheldRow(row: { actions?: string | null }): boolean {
  if (!row.actions || !row.actions.includes('"withheld"')) return false;
  try {
    const a = JSON.parse(row.actions) as { withheld?: unknown };
    return a?.withheld === true;
  } catch {
    return false;
  }
}

/** The rows minus withheld ones — for anything that feeds a model or a window. */
export function withoutWithheld<T extends { actions?: string | null }>(rows: T[]): T[] {
  return rows.filter((r) => !isWithheldRow(r));
}
