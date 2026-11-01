/**
 * Reply hygiene: JEWL copies the `[ISO]: ` stamp that history lines are
 * rendered with onto the front of his own replies (sometimes stacked). Strip
 * any run of leading stamps; a stamp mid-sentence is left alone.
 */
// Also a copied history marker on its own line: `[System: …]` (no nested brackets).
const LEADING_STAMPS = /^(?:\s*(?:\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?\]:[ \t]*|\[System:[^\]\n]*\][ \t]*(?:\r?\n|$)))+/;

export function stripEchoedStamps(text: string): string {
  return text.replace(LEADING_STAMPS, '');
}
