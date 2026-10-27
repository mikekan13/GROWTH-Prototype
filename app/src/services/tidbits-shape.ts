/**
 * Pure shaping for the ticker's tidbits (no I/O, client-safe, tested).
 *
 * Mike 2026-10-27: the first cut was "uninteresting and sometimes just straight weird" — template dumps ("Main Room is
 * a point of interest.", "Kristopher — npc, active."), genesis placeholder text, memories cut mid-sentence. So every
 * line now passes through `shapeTidbit`: prose only, whole sentences only, no templates, no placeholders.
 */

export type TidbitSource =
  /** A WorldFact / location description / object story: prose already. */
  | { kind: 'fact'; text: string }
  /** A line of shared or object history, or canon narration: prose already. */
  | { kind: 'history'; text: string }
  /** A being's own memory; `owner` closes it with a trailing dash. */
  | { kind: 'memory'; text: string; owner: string }
  /** A DayaIntention, turned into a teaser. */
  | { kind: 'intention'; description: string; trigger?: string | null; cadence?: string | null; dueCycle?: number | null; owner: string }
  /** What a perceiver knows of a subject, as one sentence from the familiarity score band. `second` = "You". */
  | { kind: 'familiarity'; subject: string; score: number; owner: string; second?: boolean }
  /** A number from the economy, already a sentence. */
  | { kind: 'economy'; text: string };

/** Data-derived lines, grouped by kind; every list may be empty. Lines are ALREADY shaped. */
export interface TidbitPool {
  facts?: string[];
  history?: string[];
  intentions?: string[];
  familiarity?: string[];
  economy?: string[];
  memories?: string[];
}

/** Template dumps and genesis placeholder phrases: any source containing one is rejected. */
const PLACEHOLDER_RES: RegExp[] = [
  /not yet established/i,
  /exists as a named person/i,
  /is a character in .+'s world/i,
  /\bis a point of interest\b/i,
  /\bis out in the world\b/i,
  /\s[—–-]\s*(?:npc|player character|character|creature|godhead)\s*,\s*(?:active|draft|dead|submitted|approved|retired)\b/i,
  /^[^.!?]{1,60} holds [^.!?]{1,60}\.?$/i, // "Violet holds The errand bag."
  /^[^.!?]{1,60} is an? (?:settlement|wilderness|dungeon|building|region|location|item)\.?$/i,
  /\b(?:lorem ipsum|placeholder|tbd|todo)\b/i,
];

export function isPlaceholder(text: string): boolean {
  return PLACEHOLDER_RES.some((re) => re.test(text.trim()));
}

/** FALLBACK ONLY — a tiny generic set, used to fill when a campaign has too little data. At most six lines. */
export const FALLBACK_TIDBITS: readonly string[] = [
  'KRMA is the only currency.',
  'Everything is a container, all the way down.',
  'A person is Body, Spirit and Soul.',
  'Death takes only Frequency.',
  'Memory is fallible. The record is not.',
  'Every character begins with a story.',
];

export const TIDBIT_COUNT = 12;
export const MAX_CHARS = 160;
const MIN_NON_MEMORY = 4;

/** Abbreviations whose period is not a sentence end. `soft` ones (ft, in) end a sentence only before a capital. */
const HARD_ABBR = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'vs', 'e.g', 'i.e', 'prof', 'sr', 'jr']);
const SOFT_ABBR = new Set(['ft', 'in', 'no', 'approx', 'etc']);

/**
 * Splits text into sentences without breaking on a period between digits ("9.5 ft"), after common abbreviations
 * (ft. in. St. Mr. Mrs. Dr. vs. e.g.), or inside an ellipsis. Every piece is reported with whether it ended on
 * terminating punctuation (a trailing fragment does not).
 */
export function splitSentences(text: string): Array<{ text: string; complete: boolean }> {
  const t = text.replace(/\s+/g, ' ').trim();
  const out: Array<{ text: string; complete: boolean }> = [];
  let start = 0;
  let i = 0;
  while (i < t.length) {
    const ch = t[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '\u2026') { i += 1; continue; }
    // the whole run of terminators, then any closing quotes / brackets
    let j = i;
    while (j < t.length && /[.!?\u2026]/.test(t[j])) j += 1;
    const run = t.slice(i, j);
    while (j < t.length && /["'\u201d\u2019)\]]/.test(t[j])) j += 1;
    const next = t.slice(j).match(/^\s*(\S)/)?.[1];
    const atEnd = j >= t.length;
    let boundary = atEnd || (t[j] === ' ' && !!next);
    if (!atEnd && !boundary) boundary = false;
    if (boundary && !atEnd) {
      const lowerNext = !!next && /[a-z0-9]/.test(next);
      if (run === '.' && /\d$/.test(t.slice(0, i)) && /^\d/.test(t.slice(j).trimStart())) boundary = false; // 9. 5
      const word = t.slice(0, i).match(/([A-Za-z.]+)$/)?.[1]?.toLowerCase().replace(/^\./, '') ?? '';
      if (run === '.' && HARD_ABBR.has(word)) boundary = false;
      if (run === '.' && SOFT_ABBR.has(word) && lowerNext) boundary = false;
      if (/\u2026|\.{2,}/.test(run) && lowerNext) boundary = false; // an ellipsis that carries on
    }
    if (boundary) { out.push({ text: t.slice(start, j).trim(), complete: true }); start = j; }
    i = j;
  }
  const rest = t.slice(start).trim();
  if (rest) out.push({ text: rest, complete: /[.!?\u2026]["'\u201d\u2019)\]]*$/.test(rest) });
  return out;
}

/** A line must open like a sentence: a capital letter or an opening quote (never lower-case, never a stray digit). */
export function startsLikeSentence(text: string): boolean {
  return /^[\u201c"'\u2018(\[]?\p{Lu}/u.test(text.trim());
}

/**
 * Is this a line of prose, not a leaked key or fragment? Fewer than 4 words, a snake_case token, or a lone
 * identifier is rejected ("reincarnation_book.").
 */
export function isProse(text: string): boolean {
  const t = text.trim();
  if (/\b[A-Za-z0-9]+_[A-Za-z0-9_]+\b/.test(t)) return false;
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length >= 4;
}

/**
 * The first one or two COMPLETE sentences of `text` — its opening, never an interior stretch — at most `max`
 * characters, ending on a sentence boundary; null when not even the first sentence fits whole.
 */
export function wholeSentences(text: string, max = MAX_CHARS, maxSentences = 2): string | null {
  let out = '';
  let n = 0;
  for (const s of splitSentences(text)) {
    if (!s.complete) break;
    const next = out ? `${out} ${s.text}` : s.text;
    if (next.length > max || n >= maxSentences) break;
    out = next;
    n += 1;
  }
  return out && startsLikeSentence(out) ? out : null;
}

/** A memory's opening must stand alone: no conjunction opener, no referent-less pronoun opener, no dangling her/him/it. */
const CONJ_OPENER = /^[\u201c"']?(?:and|but|so|or|yet|then|because|although|while|which)\b/i;
const PRONOUN_OPENER = /^[\u201c"']?(?:it|it['\u2019]s|that|that['\u2019]s|this|these|those|they|he|she|there|its)\b/i;
export function memoryOpensCleanly(text: string): boolean {
  const t = text.trim();
  if (CONJ_OPENER.test(t) || PRONOUN_OPENER.test(t)) return false;
  const m = /\b(her|him|it|them)\b/i.exec(t);
  if (m) {
    const before = t.slice(0, m.index);
    // a name earlier in the line: a capitalised word that is not the line's first word and not "I"
    const named = before.split(/\s+/).slice(1).some((w) => /^[\u201c"']?\p{Lu}[\p{L}'\u2019-]+/u.test(w) && w !== 'I');
    if (!named) return false;
  }
  return true;
}

const LEAD: Record<string, string> = { daily: 'Every day', nightly: 'Every night', weekly: 'Every week', always: 'Always' };

/** A familiarity score (0..1) as [verb, trailing words]; null under the noticing threshold. */
function knowing(score: number): [string, string] | null {
  if (!(score > 0.15)) return null;
  if (score < 0.4) return ['half-noticed', ''];
  if (score < 0.7) return ['knows', ' a little'];
  if (score < 0.9) return ['knows', ' well'];
  return ['knows', ' by heart'];
}

/** One source → one clean tidbit, or null when it cannot be made into one. */
function shapeRaw(source: TidbitSource): string | null {
  switch (source.kind) {
    case 'fact':
    case 'history': {
      if (isPlaceholder(source.text)) return null;
      const s = wholeSentences(source.text);
      return s && !isPlaceholder(s) ? s : null;
    }
    case 'economy':
      return isPlaceholder(source.text) ? null : source.text.trim() || null;
    case 'memory': {
      if (isPlaceholder(source.text)) return null;
      const s = wholeSentences(source.text);
      if (!s || isPlaceholder(s) || !memoryOpensCleanly(s)) return null;
      return `${s} — ${source.owner}`;
    }
    case 'intention': {
      if (isPlaceholder(source.description)) return null;
      const trigger = source.trigger?.trim().replace(/[.!?…]+$/, '');
      const lead = source.cadence && LEAD[source.cadence] ? LEAD[source.cadence] : source.dueCycle != null ? 'Soon' : null;
      if (trigger && lead) return `${lead}, when ${trigger}… — ${source.owner}`;
      if (trigger) return `When ${trigger}… — ${source.owner}`;
      const s = wholeSentences(source.description);
      return s && !isPlaceholder(s) ? `${s} — ${source.owner}` : null;
    }
    case 'familiarity': {
      const k = knowing(source.score);
      if (!k || !source.subject.trim() || isPlaceholder(source.subject)) return null;
      const [verb, tail] = k;
      if (verb === 'half-noticed') return source.second ? `You have only half-noticed ${source.subject.trim()}.` : `${source.owner} has only half-noticed ${source.subject.trim()}.`;
      return `${source.second ? 'You know' : `${source.owner} knows`} ${source.subject.trim()}${tail}.`;
    }
  }
}

/** One source → one clean tidbit, or null when it cannot be made into one. */
export function shapeTidbit(source: TidbitSource): string | null {
  const line = shapeRaw(source);
  if (!line) return null;
  const body = line.replace(/\s—\s[^—]+$/, ''); // the owner's trailing dash is not part of the prose
  return isProse(body) && startsLikeSentence(body) ? line : null;
}

function shuffle<T>(xs: T[], random: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Round-robin across shuffled groups, up to `count`. */
function spread(groups: string[][], random: () => number, count: number): string[] {
  const gs = groups.map((g) => shuffle([...new Set(g.filter((s) => s && s.trim()))], random)).filter((g) => g.length > 0);
  const out: string[] = [];
  while (out.length < count && gs.some((g) => g.length > 0)) {
    for (const g of shuffle(gs, random)) {
      const next = g.shift();
      if (next !== undefined && out.length < count) out.push(next);
    }
  }
  return out;
}

/**
 * ~12 lines, sampled at random, spread across kinds. At most one line in three is a memory. Fewer than
 * MIN_NON_MEMORY real non-memory lines → the tiny generic fallback tops them up and `fallback` is true.
 */
export function sampleTidbits(pool: TidbitPool, random: () => number = Math.random, count = TIDBIT_COUNT): { tidbits: string[]; fallback: boolean } {
  const { memories = [], ...rest } = pool;
  let others = spread(Object.values(rest) as string[][], random, count);
  let fallback = false;
  if (others.length < MIN_NON_MEMORY) {
    others = [...others, ...shuffle([...FALLBACK_TIDBITS], random).slice(0, MIN_NON_MEMORY - others.length)];
    fallback = true;
  }
  const room = Math.min(count - others.length, Math.floor(others.length / 2));
  const mems = room > 0 ? spread([memories], random, room) : [];
  return { tidbits: shuffle([...others, ...mems], random), fallback };
}
