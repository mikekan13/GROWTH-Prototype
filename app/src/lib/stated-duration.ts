/**
 * How long a table line takes in the world (Mike 2026-10-24: "if the GM says 2
 * hours go by then that should be tracked. otherwise it should be based on how
 * long it makes sense to take based on the simulations calculations").
 *
 *   statedDurationSeconds  — time the GM SAID passed: "two hours pass", "an hour
 *                            later", "the next morning", "a moment". Null when
 *                            the line states none.
 *   plausibleActSeconds    — the sim's own estimate for an act or a line that
 *                            states no time: speech at talking pace, a knock
 *                            or a nod in seconds, a walk across a room in a
 *                            minute. Never more than PLAUSIBLE_CAP_SECONDS.
 *
 * Pure. Encounters do not come here (their rounds are 6 s each).
 */

const SMALL_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  couple: 2, few: 3, several: 4, half: 0.5, 'half an': 0.5, 'half a': 0.5, 'a couple of': 2, 'a few': 3,
};

const UNIT_SECONDS: Record<string, number> = {
  second: 1, seconds: 1, sec: 1, secs: 1,
  minute: 60, minutes: 60, min: 60, mins: 60,
  hour: 3600, hours: 3600, hr: 3600, hrs: 3600,
  day: 86400, days: 86400,
  week: 7 * 86400, weeks: 7 * 86400,
  month: 30 * 86400, months: 30 * 86400,
  year: 365 * 86400, years: 365 * 86400,
};

const NUM = '(\\d+(?:\\.\\d+)?|half an|half a|a couple of|a few|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|couple|few|several)';
const UNIT = '(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?)';
// "two hours pass" / "2 hours go by" / "an hour later" / "after twenty minutes" / "some ten minutes on"
const SPAN_RE = new RegExp(`\\b(?:after|some|about|nearly|almost|roughly|over)?\\s*${NUM}\\s+${UNIT}\\b\\s*(?:pass(?:es)?|go(?:es)? by|later|on|of silence|of waiting|crawl(?:s)? by|drag(?:s)? by|tick(?:s)? by|elapse(?:s)?)?`, 'i');
const SPAN_VERB_RE = /\b(pass(?:es)?|go(?:es)? by|later|crawl(?:s)? by|drag(?:s)? by|tick(?:s)? by|elapse(?:s)?|of silence|of waiting|after|some|about|nearly|almost|roughly)\b/i;

function num(word: string): number | null {
  const w = word.trim().toLowerCase();
  if (/^\d/.test(w)) return Number(w);
  return SMALL_NUMBERS[w] ?? null;
}

export interface StatedDurationContext {
  /** Local hour of day (0–23) on the campaign calendar, for "the next morning" / "that evening". */
  localHour?: number;
}

/** Seconds the GM's words say passed, or null when they state no span. Pure. */
export function statedDurationSeconds(text: string, ctx: StatedDurationContext = {}): number | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const hour = ctx.localHour ?? 12;
  const untilHour = (target: number) => ((target - hour + 24) % 24 || 24) * 3600;

  if (/\b(the )?next (morning|day)\b|\bcome morning\b|\bby morning\b|\bat dawn\b|\bthe following morning\b/i.test(t)) return untilHour(7);
  if (/\b(the )?next (evening|night)\b/i.test(t)) return untilHour(19) + (hour >= 19 ? 0 : 0) + (hour < 19 ? 0 : 24 * 3600 - 0) * 0 + 24 * 3600 * (hour < 19 ? 0 : 0) + (hour >= 19 ? 24 * 3600 : 0) * 0 + 0;
  if (/\blater that (night|evening)\b|\bthat (evening|night)\b|\bby nightfall\b|\bby evening\b|\bcome evening\b/i.test(t)) return hour < 19 ? untilHour(19) : 2 * 3600;
  if (/\blater that (day|afternoon)\b|\bthat afternoon\b|\bby afternoon\b/i.test(t)) return hour < 14 ? untilHour(14) : 2 * 3600;
  if (/\blater that morning\b/i.test(t)) return 2 * 3600;
  if (/\b(a |one )?week (later|passes|goes by)\b/i.test(t)) return 7 * 86400;

  const m = t.match(SPAN_RE);
  if (m) {
    const n = num(m[1]);
    const unitWord = m[2].toLowerCase();
    const u = UNIT_SECONDS[unitWord] ?? UNIT_SECONDS[unitWord.replace(/s$/, '')];
    // "a minute" alone ("give me a minute") is speech, not a jump: a span needs a passing verb or a leading "after/about…".
    const whole = m[0];
    // "waits in the hallway for 30 seconds and then…" (HW8 run 6): a span the narration says an act lasts — "for/over/within N units" outside any quoted speech.
    const before = t.slice(0, m.index ?? 0);
    const outsideQuotes = ((before.match(/["“”]/g) ?? []).length % 2) === 0;
    const lasts = outsideQuotes && /\b(?:for|over|within|another)\s*$/i.test(before) && !/^(?:a|an)$/i.test(m[1].trim());
    const stated = lasts || SPAN_VERB_RE.test(whole) ||/\b(pass|go by|later)\b/i.test(t.slice((m.index ?? 0) + whole.length, (m.index ?? 0) + whole.length + 24));
    if (n !== null && u && stated) return Math.round(n * u);
  }
  if (/\b(a long while|a good while|a while) (passes|goes by|later)\b/i.test(t)) return 15 * 60;
  if (/\b(a moment|a beat|a long moment|a long beat) (passes|goes by|later)\b/i.test(t) || /\bafter a (long )?(moment|beat|pause)\b/i.test(t)) return 10;
  if (/\bminutes (pass|go by|crawl|drag)\b/i.test(t)) return 5 * 60;
  if (/\bhours (pass|go by|crawl|drag)\b/i.test(t)) return 3 * 3600;
  return null;
}

/** The most the sim guesses on its own for one line or act; longer spans must be stated. */
export const PLAUSIBLE_CAP_SECONDS = 30 * 60;

const QUICK_ACT_RE = /\b(knock|knocks|nod|nods|shrug|shrugs|glance|glances|look|looks|blink|blinks|sigh|sighs|smile|smiles|frown|frowns|wince|winces|shake|shakes|tap|taps|press|presses|grab|grabs|take|takes|pick|picks|set|sets|put|puts|open|opens|close|closes|shut|shuts|turn|turns|lean|leans|step|steps|reach|reaches|hand|hands|point|points|wave|waves)\b/i;
const MOVE_RE = /\b(walk|walks|cross|crosses|go|goes|head|heads|climb|climbs|descend|descends|run|runs|hurr(?:y|ies)|pace|paces|wander|wanders|follow|follows|leave|leaves|enter|enters|carr(?:y|ies))\b/i;
const SLOW_RE = /\b(search|searches|read|reads|cook|cooks|eat|eats|wash|washes|clean|cleans|dress|dresses|shower|showers|wait|waits|sit (?:down )?(?:and|for)|rest|rests|sleep|sleeps|nap|naps|pack|packs|unpack|unpacks|write|writes|study|studies|repair|repairs|fix|fixes|dig|digs|build|builds)\b/i;

export type ActKind = 'gm-line' | 'being-speech' | 'being-act';

/**
 * The sim's own estimate for a line that states no span. Speech runs at
 * talking pace (about 150 words a minute, plus a breath); a quick act is a few
 * seconds; crossing a room is about a minute; a slow act a few minutes. Pure.
 */
export function plausibleActSeconds(kind: ActKind, text: string): number {
  const words = (text.match(/[A-Za-z0-9''’]+/g) ?? []).length;
  const speech = Math.max(2, Math.round(2 + words * 0.4));
  if (kind === 'being-speech') return Math.min(PLAUSIBLE_CAP_SECONDS, speech);
  if (SLOW_RE.test(text)) return Math.min(PLAUSIBLE_CAP_SECONDS, 3 * 60 + words * 2);
  if (MOVE_RE.test(text)) return Math.min(PLAUSIBLE_CAP_SECONDS, 45 + words);
  if (QUICK_ACT_RE.test(text)) return Math.min(PLAUSIBLE_CAP_SECONDS, 4 + Math.round(words * 0.3));
  // Narration with no telling verb: the time it takes to be lived at reading pace.
  return Math.min(PLAUSIBLE_CAP_SECONDS, speech);
}

export interface LineDuration {
  seconds: number;
  source: 'stated' | 'plausible';
}

/** What a line costs the clock: the span it states, else the sim's estimate. Pure. */
export function lineDuration(kind: ActKind, text: string, ctx: StatedDurationContext = {}): LineDuration {
  const stated = kind === 'gm-line' ? statedDurationSeconds(text, ctx) : null;
  if (stated !== null && stated > 0) return { seconds: stated, source: 'stated' };
  return { seconds: plausibleActSeconds(kind, text), source: 'plausible' };
}
