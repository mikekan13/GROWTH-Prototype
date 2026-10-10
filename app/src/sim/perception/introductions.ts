/**
 * INTRODUCTIONS TEACH NAMES (Mike 2026-10-09: "of course it should."; memory
 * `ruling-passive-active-perception-familiarity-2026-10-08`, newest section).
 *
 * Pure detection over what a perceiver actually CAUGHT of a line of speech
 * (services/visible-form fragmenting: missed words are `{gap}`). A pattern only
 * fires when the introducing phrase AND the name are caught words in one run —
 * a regex never matches across a `{gap}`, so a missed name teaches nothing.
 *
 *   self-introduction  "I'm Ruth" / "My name is Ruth" / "Call me Ruth"  → the speaker,
 *                      only when the name said IS the speaker's name (an alias teaches nothing true)
 *   by another         "This is Ruth" / "Meet Ruth" / "Her name is Ruth" → the one being present
 *                      whose name matches (full name, or its first word); ambiguous → nobody
 *
 * Deterministic patterns only (design for the small model: no model call).
 * Party membership does NOT seed names (Mike 2026-10-09: "that is up to the GM's story").
 */

export const GAP = '{gap}';

/** One caught piece of a speech segment (VisiblePiece-compatible). */
export type CaughtPiece = { kind: 'text'; text: string } | { kind: 'gap' } | { kind: 'entity'; text: string; entityId: string };

/** A being that could be introduced. */
export interface IntroCandidate { id: string; name: string }

export interface DetectedIntro { kind: 'self' | 'other'; /** The caught words after the phrase (up to 3, stopped at punctuation / a gap). */ words: string[] }

const APOS = `['’]`;
const SELF_PHRASES = [
  `i${APOS}?m`, 'i am', `my name${APOS}?s`, 'my name is', `the name${APOS}?s`, `name${APOS}s`, 'call me', 'they call me', 'you can call me', 'i go by',
];
const OTHER_PHRASES = [
  'this is', `this${APOS}s`, `this here${APOS}?s`, 'that is', `that${APOS}s`, 'meet', `here${APOS}s`, 'here is',
  'say hello to', 'say hi to', 'introducing', 'allow me to introduce', 'let me introduce', 'may i introduce',
  `(?:her|his|their) name${APOS}?s`, '(?:her|his|their) name is', `(?:she|he)${APOS}?s called`, `they${APOS}re called`, 'she is called', 'he is called',
];

const phraseRe = (phrases: string[]) =>
  new RegExp(`(?<![\\p{L}])(?:${phrases.map((p) => p.replace(/ /g, '\\s+')).join('|')})\\s+([^.,!?;:"“”()\\[\\]]+)`, 'giu');
const SELF_RE = phraseRe(SELF_PHRASES);
const OTHER_RE = phraseRe(OTHER_PHRASES);

/** The caught text of a segment, gaps as `{gap}`. Pure. */
export function caughtText(pieces: CaughtPiece[]): string {
  return pieces.map((p) => (p.kind === 'gap' ? ` ${GAP} ` : p.text)).join('').replace(/\s+/g, ' ').trim();
}

/** Up to 3 words after a phrase, stopping at a gap. Possessives ("Ruth's sword") are not introductions. Pure. */
function nameWords(tail: string): string[] | null {
  const cut = tail.split(GAP)[0];
  const words = cut.trim().split(/\s+/).filter(Boolean).slice(0, 3);
  if (!words.length || new RegExp(`${APOS}s$`, 'iu').test(words[0])) return null;
  return words.map((w) => w.replace(/[^\p{L}'’-]/gu, '')).filter(Boolean);
}

/** Every introduction pattern in the caught text. Pure. */
export function detectIntroductions(text: string): DetectedIntro[] {
  const out: DetectedIntro[] = [];
  for (const [kind, re] of [['self', SELF_RE], ['other', OTHER_RE]] as const) {
    for (const m of text.matchAll(re)) {
      const words = nameWords(m[1] ?? '');
      if (words?.length) out.push({ kind, words });
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/[’]/g, "'");

/** Does the said name match this being's name — its full name as the leading words, or its first word? Pure. */
export function nameMatches(words: string[], name: string): boolean {
  const tokens = name.trim().split(/\s+/).map(norm).filter(Boolean);
  if (!tokens.length || !words.length) return false;
  const said = words.map(norm);
  if (tokens.length <= said.length && tokens.every((t, i) => said[i] === t)) return true;
  return tokens[0].length >= 3 && said[0] === tokens[0];
}

/**
 * Which beings this caught speech introduces. `speakerId` is the speaker
 * (null = unknown: no self-introduction). `present` = beings in the scene; the
 * perceiver itself is never "introduced" to itself. Pure.
 */
export function introducedBeings(pieces: CaughtPiece[], speaker: IntroCandidate | null, present: IntroCandidate[], perceiverId: string): string[] {
  const found = new Set<string>();
  for (const intro of detectIntroductions(caughtText(pieces))) {
    if (intro.kind === 'self') {
      if (speaker && nameMatches(intro.words, speaker.name)) found.add(speaker.id);
      continue;
    }
    const matches = present.filter((b) => b.id !== speaker?.id && nameMatches(intro.words, b.name));
    // A full-name match wins over first-name matches; still ambiguous → nobody.
    const full = matches.filter((b) => { const t = b.name.trim().split(/\s+/); return t.length <= intro.words.length && t.every((x, i) => norm(x) === norm(intro.words[i])); });
    const pick = full.length === 1 ? full : matches.length === 1 ? matches : [];
    for (const b of pick) found.add(b.id);
  }
  found.delete(perceiverId);
  return [...found];
}
