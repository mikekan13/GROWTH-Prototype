/**
 * Lawfulness screen patterns (Mike 2026-10-12, unit 8 of the wall build).
 *
 * Code-only, recall-biased cue lists. The screen runs on EVERY utterance and
 * every local model output, so it is regex + co-occurrence, never a model call.
 * A false positive costs a human moderator a glance; a false negative is a
 * legal problem — lean toward firing, but never on category (4): dark-but-
 * fictional violence (murder, torture, war) is ALLOWED and carries no cue here.
 *
 * Each rule has a stable `id`. Flags store ids only (`screenHits`), never the
 * matched text. To extend: add a `{ id, re }` to the right list. Every `re`
 * must be case-insensitive and global (`gi`) — the screen walks all matches to
 * find co-occurrence within `CO_OCCURRENCE_WINDOW` characters.
 */

import { NUDE_BODY_WORD, type PatternRule } from './content-cues';

// The minor/age and sexual cue lists live in ONE shared module, also read by
// the tone filter (unit 8b). Re-exported here so the screen's imports stay put.
export { AGE_CUES, SEXUAL_CUES, NUM_UNDER_18, WORD_UNDER_18, type PatternRule } from './content-cues';

/** Two cues count as co-occurring when their matches start within this many chars. */
export const CO_OCCURRENCE_WINDOW = 400;

// ── Nudity cues (IMAGE prompts only) ───────────────────────────────────────
export const NUDITY_CUES: PatternRule[] = [
  // "nude"/"naked" via NUDE_BODY_WORD: a "nude lip" / "nude-pink" colour is not nudity.
  { id: 'img:nudity', re: new RegExp(`${NUDE_BODY_WORD}|\\b(?:nudes|topless|bottomless|unclothed|undress\\w*|lingerie|bikini|underwear|see-through|breasts?|cleavage)\\b`, 'gi') },
  { id: 'img:pose', re: /\b(?:boudoir|pin-?up|seductive|provocative|suggestive|spread\s+legs|on\s+all\s+fours)\b/gi },
];

// ── REAL_PERSON_THREAT: threat verbs ───────────────────────────────────────
// Harm verbs. In fiction these are everywhere; they only fire when a REAL-
// person referent sits in the same window.
export const THREAT_VERBS: PatternRule[] = [
  { id: 'threat:kill', re: /\b(?:kill\w*|murder\w*|shoot\w*|shot|stab\w*|strangl\w*|choke|choking|slit\s+(?:his|her|their)\s+throat|bomb\w*|poison\w*)\b/gi },
  { id: 'threat:harm', re: /\b(?:hurt|beat\s+(?:up|the\s+shit)|break\s+(?:his|her|their)\s+\w+|burn\s+(?:down\s+)?(?:his|her|their)\s+(?:house|home|car)|run\s+(?:him|her|them)\s+over)\b/gi },
  { id: 'threat:stalk', re: /\b(?:i\s+know\s+where\s+(?:you|he|she|they)\s+lives?|find\s+where\s+(?:you|he|she|they)\s+lives?|show\s+up\s+at\s+(?:your|his|her|their)\s+(?:house|home|work|school)|watching\s+(?:your|his|her|their)\s+house|you(?:'re|\s+are)\s+dead|(?:he|she|they)(?:'s|\s+is|\s+are|'re)\s+dead\s+meat)\b/gi },
];

// ── REAL_PERSON_THREAT: real-person referents (besides known user names) ──
export const REAL_REFERENTS: PatternRule[] = [
  { id: 'real:relation', re: /\bmy\s+(?:neighbou?r|neighbou?rs|boss|ex|ex-wife|ex-husband|ex-girlfriend|ex-boyfriend|exes|coworker|co-worker|coworkers|landlord|teacher|principal|manager|supervisor|roommate)\b/gi },
  { id: 'real:irl', re: /\b(?:irl|in\s+real\s+life|outside\s+(?:the|this)\s+game|after\s+(?:the\s+)?session)\b/gi },
  { id: 'real:handle', re: /(?:^|[\s(])@[A-Za-z0-9_]{2,30}\b/g },
];

// ── Doxxing: personal locators. A real referent + a locator = a dox hit. ──
export const LOCATORS: PatternRule[] = [
  { id: 'dox:address', re: /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){1,3}(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|boulevard|blvd|court|ct|way|place|pl|terrace|circle|cir|highway|hwy)\b\.?/gi },
  { id: 'dox:phone', re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
  { id: 'dox:email', re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
];

/** Shortest real-user name the screen will match (avoids "Al", "Jo" noise). */
export const MIN_NAME_LENGTH = 3;

/** Every match start index of a rule list, tagged with its rule id. */
export function findCues(text: string, rules: PatternRule[]): { id: string; index: number }[] {
  const out: { id: string; index: number }[] = [];
  for (const rule of rules) {
    rule.re.lastIndex = 0;
    for (const m of text.matchAll(rule.re)) out.push({ id: rule.id, index: m.index ?? 0 });
  }
  return out;
}

/** Escape a literal for use inside a RegExp. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
