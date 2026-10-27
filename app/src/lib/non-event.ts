/**
 * The "nothing happened" family (Mike 2026-10-26: "The nothing reached is really wrong for EITHER view. It reads odd.
 * The narration cards shouldn't even appear for most of them"). One matcher shared by the in-session card feed
 * (table-feed/feed-rows.ts) and the out-of-session novel (terminal/novel/compose-novel.ts), so they cannot drift.
 *
 * A sentence is a non-event when it matches any of:
 *   - "Nothing (on the landing) has changed."             nothing … has/have changed
 *   - "Nothing (new) has reached Violet from beyond …"    nothing … reach / reaches / reached
 *   - "The knock has settled into silence" / "gone quiet" / "gone still" / "fallen silent"
 * Pure, client-safe.
 */
const NOTHING_PATTERNS: RegExp[] = [
  /\bnothing\b[^.;!?]*\b(?:has|have)\s+changed\b/i,
  /\bnothing\b[^.;!?]*\breach(?:es|ed)?\b/i,
  /\b(?:has|have)\s+(?:settled\s+into\s+silence|gone\s+(?:quiet|still)|fallen\s+silent)\b/i,
];

/** Is this whole line (one short sentence or two) a non-event? */
export function isNothingLine(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length < 220 && NOTHING_PATTERNS.some((re) => re.test(t));
}

/** The text with its non-event sentences removed ('' when nothing else was said). */
export function stripNonEvents(text: string): string {
  const parts = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [text];
  return parts.filter((s) => !isNothingLine(s)).join('').trim();
}
