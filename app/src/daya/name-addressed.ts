/**
 * WHO SAID WHOSE NAME (HW8 run 6): he said HER name ("Violet? I have a pizza…") and her thought opened with
 * `"Kristopher." The name lands on the wood…` — the name inside his quoted words read as the one who spoke. When the words
 * a hearer is handed contain the hearer's own name, the line says so: `Kristopher says your name — "Violet? I have a pizza…"`.
 * The speaker's label is whatever the hearing already allows (a stranger stays "A man's voice"). Pure.
 */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Does `text` contain the hearer's name (full, or first name)? Pure. */
export function nameIsHers(text: string, hearerName: string): boolean {
  const full = hearerName.trim();
  if (!full) return false;
  const first = full.split(/\s+/)[0];
  const parts = [...new Set([full, first])].filter((p) => p.length >= 2);
  return parts.some((p) => new RegExp(`(^|[^\\p{L}])${escapeRe(p)}(?![\\p{L}])`, 'iu').test(text));
}

const SPOKEN_LINE_RE = /^([^:\n"“”]{1,60}):\s+(\S[\s\S]*)$/;

/** Each `Speaker: words` line whose words carry the hearer's name becomes `Speaker says your name — "words"`. Pure. */
export function markAddressedByName(content: string, hearerName: string): string {
  if (!hearerName.trim()) return content;
  return content.split('\n').map((line) => {
    const m = SPOKEN_LINE_RE.exec(line);
    if (!m) return line;
    const [, label, words] = m;
    if (nameIsHers(label, hearerName) || /\bsays your name\b/i.test(label)) return line;
    if (!nameIsHers(words, hearerName)) return line;
    return `${label.trim()} says your name — "${words.trim().replace(/^["“]|["”]$/g, '')}"`;
  }).join('\n');
}
