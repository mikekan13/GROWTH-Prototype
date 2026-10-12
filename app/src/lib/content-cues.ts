/**
 * Shared content cues — the ONE home of the minor/age and sexual cue lists
 * (unit 8b, 2026-10-12). Two screens read them:
 *
 *   - the LAWFULNESS screen (`lib/lawfulness-patterns.ts`, `services/lawfulness.ts`)
 *     — keeps content LEGAL; a hit files a flag against a person, so its lists
 *     are tight: `AGE_CUES` + `SEXUAL_CUES` (explicit acts only).
 *   - the TONE FILTER (`ai/network/tone-filter.ts`) — keeps cloud refusals from
 *     tripping; a hit only rewrites/withholds a cloud copy, so it reads wider:
 *     `AGE_CUES` + `TONE_EXTRA_AGE_CUES`, and the lurid-register lists
 *     `TONE_SEXUAL_CUES` / `TONE_SEXUAL_VIOLENCE_CUES`.
 *
 * Pure data, no imports. Every rule here is case-insensitive and global (`gi`)
 * so `matchAll` can walk every match. To extend a screen, add to the list it
 * reads — never fork a second copy elsewhere.
 */

export interface PatternRule {
  id: string;
  re: RegExp;
}

/** 1–17 as digits, and as words — the ages that place a minor. */
export const NUM_UNDER_18 = '(?:[1-9]|1[0-7])';
export const WORD_UNDER_18 =
  '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)';

// ── Age cues (both screens) ─────────────────────────────────────────────────
// Any word that can place a minor in the passage. Deliberately broad ("boy",
// "girl"): it only matters when a SEXUAL cue sits in the same window/chunk.
export const AGE_CUES: PatternRule[] = [
  // "baby" is left out here: adult slang ("hey baby") would pair with "sexy" and
  // file a lawfulness flag. The tone filter adds it back (TONE_EXTRA_AGE_CUES).
  { id: 'age:child-word', re: /\b(?:child|children|childlike|kid|kids|toddler|toddlers|infant|infants|preteen|pre-teen|tween|tweens)\b/gi },
  { id: 'age:minor-word', re: /\b(?:minor|minors|underage|under-age|under\s+age|jailbait|loli|lolicon|shota|shotacon)\b/gi },
  { id: 'age:teen-word', re: /\b(?:teen|teens|teenage|teenager|teenagers|adolescent|adolescents|pubescent|prepubescent|pre-pubescent)\b/gi },
  { id: 'age:boy-girl', re: /\b(?:boy|boys|girl|girls|schoolgirl|schoolgirls|schoolboy|schoolboys|little\s+(?:one|ones))\b/gi },
  { id: 'age:grade', re: /\b(?:middle\s+school|elementary\s+school|grade\s+school|junior\s+high|(?:[1-8]|first|second|third|fourth|fifth|sixth|seventh|eighth)(?:st|nd|rd|th)?\s+grade(?:r|rs)?)\b/gi },
  { id: 'age:numeric', re: new RegExp(`\\b${NUM_UNDER_18}\\s*(?:-|\\s)?\\s*(?:years?|yrs?|y\\/o|yo)(?:\\s*-?\\s*old)?\\b`, 'gi') },
  { id: 'age:numeric-word', re: new RegExp(`\\b${WORD_UNDER_18}\\s*(?:-|\\s)\\s*(?:years?|yrs?)(?:\\s*-?\\s*old)?\\b`, 'gi') },
  { id: 'age:aged', re: new RegExp(`\\b(?:aged?|age\\s+of)\\s+(?:${NUM_UNDER_18}|${WORD_UNDER_18})\\b`, 'gi') },
];

/**
 * Tone-filter-only age cues: the wider reading its minor-sexual hard block has
 * always used (word stems, "baby", "lad"/"lass", "juvenile", "puberty").
 * Together with `AGE_CUES` this covers every cue the tone filter had before
 * the merge.
 */
export const TONE_EXTRA_AGE_CUES: PatternRule[] = [
  { id: 'tone-age:child', re: /\b(?:childhood|baby|babies)\b/gi },
  { id: 'tone-age:teen', re: /\b(?:teenage\w*|adolescen\w*|pubescen\w*|prepubescen\w*|puberty|juvenile)\b/gi },
  { id: 'tone-age:young', re: /\b(?:schoolgirl\w*|schoolboy\w*|lad|lass|youngster\w*)\b/gi },
];

// ── Sexual cues — LAWFULNESS (explicit acts) ────────────────────────────────
// Sexual ACTS / explicit content. Bare nudity ("naked", "undressed") is NOT
// here: a war passage with a naked, starving child is dark fiction, and a boy
// undressing for bed is not sexual. Nudity only counts in IMAGE prompts (see
// NUDITY_CUES in lawfulness-patterns). Combat-ambiguous words are left out on
// purpose: "breast" (an arrow in the breast), "crotch", "penetrated her
// armour", "stripped her of rank", and profanity used as insults.
export const SEXUAL_CUES: PatternRule[] = [
  { id: 'sex:explicit', re: /\b(?:sex|sexual|sexually|sexy|intercourse|erotic|erotica|porn|porno|pornographic|nsfw|lewd|xxx)\b/gi },
  { id: 'sex:acts', re: /\b(?:fondl\w*|molest\w*|grop(?:e|ed|es|ing)\s+(?:her|him|them|me)|rape[ds]?|raping|rapist|masturbat\w*|orgasm\w*|ejaculat\w*|fellatio|cunnilingus|blowjob|handjob|copulat\w*|seduc\w*|foreplay|(?:sleep|sleeps|slept|sleeping)\s+with|(?:have|has|had|having)\s+sex)\b/gi },
  { id: 'sex:anatomy', re: /\b(?:genital\w*|penis|penises|vagina\w*|vulva|clitoris|nipples?|erection|cock)\b/gi },
];

// ── "nude" / "naked" as a COLOUR or cosmetic/garment descriptor ─────────────
// (2026-10-12, the Violet false positive: `"cosmetics": "...nude-pink lip"`.)
// "nude lip", "nude-pink", "nude heels", "beige-nude polish" describe a colour,
// not a body. The bare word stays a cue everywhere else.
const NUDE_COLOUR_BEFORE = '(?<!(?:pink|beige|blush|peach|rose|tan|taupe|mauve|brown|caramel|mocha)[-\\s])';
const NUDE_COLOUR_AFTER =
  '(?![-\\s]+(?:pinks?|lips?|lipsticks?|lip-?gloss|gloss|lip\\s+colou?r|tones?|toned|shades?|colou?r\\w*|hues?|heels?|beige|palettes?|polish|eyeshadows?|eye\\s+shadows?|eyeliner|stockings?|tights|hosiery|pumps?|flats?|sandals?|shoes?|nails?|manicure|make-?up|blush|foundation|mauve|peach|brown|tan|taupe|neutral\\w*|bra|bras|leotard|shapewear|slip-?ons?)\\b)';
/** `nude` / `naked` as a body word — never the colour/cosmetic sense. */
export const NUDE_BODY_WORD = `${NUDE_COLOUR_BEFORE}\\b(?:nude|naked)\\b${NUDE_COLOUR_AFTER}`;

// ── Locality (minor-sexual co-occurrence) ───────────────────────────────────
// A sexual cue and an age cue only count together when they are LOCAL: within
// this many characters, or inside the same sentence. Never "anywhere in a
// chunk" — a 2.4k genome chunk holds a childhood heading AND an appearance
// block, and those are not one thought (2026-10-12).
export const LOCAL_CUE_WINDOW = 200;

/** True when no sentence break (terminal punctuation + space, or a newline) sits between the two offsets. */
export function inSameSentence(text: string, a: number, b: number): boolean {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return !/[.!?]["'”’)\]]*\s|\n/.test(text.slice(lo, hi));
}

/** The locality rule both screens share. Offsets are match starts. */
export function cuesAreLocal(text: string, a: number, b: number, window = LOCAL_CUE_WINDOW): boolean {
  return Math.abs(a - b) <= window || inSameSentence(text, a, b);
}

export interface CueMatch {
  /** The matched cue word itself, lower-cased (safe to log — never the surrounding text). */
  word: string;
  index: number;
}

/** Every match of every pattern, with its start offset. */
export function matchCues(text: string, patterns: RegExp[]): CueMatch[] {
  const out: CueMatch[] = [];
  for (const p of patterns) {
    const re = new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g');
    for (const m of text.matchAll(re)) out.push({ word: m[0].toLowerCase().replace(/\s+/g, ' ').slice(0, 40), index: m.index ?? 0 });
  }
  return out;
}

/** The local (age, sexual) pairs, as deduped cue words per side. Empty sides = no local pair. */
export function localPairs(text: string, age: CueMatch[], sexual: CueMatch[], window = LOCAL_CUE_WINDOW): { age: string[]; sexual: string[] } {
  const a = new Set<string>();
  const s = new Set<string>();
  for (const x of age) {
    for (const y of sexual) {
      if (cuesAreLocal(text, x.index, y.index, window)) { a.add(x.word); s.add(y.word); }
    }
  }
  return { age: [...a].sort(), sexual: [...s].sort() };
}

// ── Sexual cues — TONE FILTER (lurid register, refusal-avoidance) ──────────
// Wider than the lawfulness list on purpose: nudity, profanity and brothels
// do not make content unlawful, but they can trip a cloud model's filter.
export const TONE_SEXUAL_CUES: RegExp[] = [
  /\b(sex|sexual|sexually|sexy|erotic\w*|orgasm\w*|aroused|arousal|intercourse|lust\w*|seduc\w*|foreplay)\b/i,
  new RegExp(`${NUDE_BODY_WORD}|\\b(?:nudity|undress\\w*|stripped (?:naked|bare))\\b`, 'i'),
  /\b(genital\w*|penis|vagina|breasts?|nipples?|cock|clit\w*|groin|crotch)\b/i,
  /\b(fuck\w*|made love|making love|slept with|bedded|in bed together|moan\w*)\b/i,
  /\b(brothel|whore\w*|prostitut\w*|harlot|courtesan|concubine)\b/i,
];

export const TONE_SEXUAL_VIOLENCE_CUES: RegExp[] = [
  /\b(rape|raped|rapes|raping|rapist)\b/i,
  /\b(molest\w*|ravish\w*|defil\w*|incest\w*|grop\w*)\b/i,
  /\bsexual(ly)?\s+(assault\w*|abus\w*|violen\w*)\b/i,
  /\bforced\s+(himself|herself|themself|themselves)\s+(on|upon)\b/i,
];
