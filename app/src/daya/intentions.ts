/**
 * Intentions — what a being means to do (Mike 2026-10-25).
 *
 * A GRO.vine is a being's overall goal ("release GROWTH"). Under the vines sits
 * everything else a life is made of: the thing she means to do tonight when he
 * knocks, the pizza she orders every day, the door she locks every time, the
 * day job. None of that had a shape before — it was prose inside memories with
 * no time, no trigger, no pending or done, and recall could only reach it by
 * the accident of shared words. "How are we tracking and more importantly how
 * are we recalling all the various goals and memories?"
 *
 * An intention is a row: the sentence as the being put it, the trigger that
 * calls it up ("he knocks"), the window it is for (tonight), a cadence when it
 * repeats (every day), the vine it serves, and whether it is still pending.
 * Intentions are DERIVED from the being's own words at encode time (a
 * prospective sentence in the first person), never authored — the engine
 * derives, it does not hard-prompt.
 *
 * Recall: a pending intention whose trigger is in the cue, or whose time is
 * now, is DUE. Its source memory climbs to the `intention` rung (above the
 * vines, below survival) and surfaces outside the Wisdom budget and the Wit
 * roll — you do not need wisdom to remember what you meant to do when the
 * moment arrives. Stale time-only intentions lapse when the being next
 * reaches for them.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { cueCoverage } from './ladder';
import { goalsTouched } from './chain';

/** One local day in campaign cycles under the standard reckoning (one meta cycle = one year). */
export const DAY_CYCLES = 1 / 365.25;

export type Cadence = 'daily' | 'nightly' | 'weekly' | 'always';

export interface IntentionDraft {
  /** The sentence as the being put it. */
  description: string;
  /** What calls it up: the clause after when / once / if / as soon as. */
  trigger: string | null;
  /** The window it is for, in cycles; null = no time of its own. */
  dueCycle: number | null;
  dueUntil: number | null;
  /** Repeating intentions — a habit, a routine. */
  cadence: Cadence | null;
}

export type IntentionAuthority = 'self' | 'player' | 'gm';

export interface DueIntention {
  id: string;
  description: string;
  trigger: string | null;
  sourceMemoryId: string | null;
  goalId: string | null;
  why: 'trigger' | 'time';
  /** Whose word it is: the being's own, the Trailblazer's stated plan, or the Watcher's override (stretch 2026-10-31). */
  authority: IntentionAuthority;
  /** The window, when the row has one (finding 63, 2026-11-05: a meeting leaves early, so the chooser needs the clock). */
  dueCycle?: number | null;
  dueUntil?: number | null;
}

// ── Grammar of a prospective sentence (first person, future-leaning) ─────────

const PROSPECTIVE_RE = /\bI(?:'m| am) going to\b|\bI will\b|\bI'll\b|\bI plan to\b|\bI mean to\b|\bI intend to\b|\bI(?:'m| am) supposed to\b|\bI have to\b|\bI(?:'ve| have) decided to\b|\bI promised to\b|\bI(?:'m| am) meant to\b/i;
/** "If he doesn't, I go to the shelter" — a conditional present counts as a plan. */
/** Finding 78 (2026-11-05): a first-person present resolve in a thought — "I should write back", "I need to answer" — is held now, not someday. */
const RESOLVE_RE = /^(?:(?:and|but|so|then|now|okay|ok|no|yes),?\s+)?I (?:should|need to|ought to)\s+(?!be\b|have\b|not\b)[a-z]+/i;
const CONDITIONAL_PLAN_RE = /^(?:and |but |then )?if\s+([^,]+),\s*I\s+(?!was\b|had\b|did\b|would\b|could\b|thought\b|think\b|knew\b|know\b|might\b|should\b|am\b|'m\b)\w+/i;
/** A habit needs its marker AND the being doing something in the present: "I lock the door every time". */
const ROUTINE_RE = /\b(every (?:day|night|morning|evening|afternoon|week|time)|each (?:day|night|morning|evening|time)|always|daily|nightly|most (?:days|nights|mornings|evenings))\b/i;
const PRESENT_SELF_VERB_RE = /\bI (?!was\b|had\b|did\b|thought\b|used\b|would\b|could\b|am\b|'m\b|'d\b|'ve\b|have\b|know\b|think\b)[a-z]+\b/;
/** The clause that calls it up: a leading when/if, or one right after an opening time word ("Tonight, when he knocks, …"). */
const TRIGGER_RE = /^(?:[A-Za-z][\w' ]{0,24},\s*)?(?:when|once|as soon as|the moment|if)\s+([^,.;—]+)/i;
const SELF_RE = /\bI\b|\bI'm\b|\bI'll\b|\bI've\b|\bmy\b/;
/** Past or reported framing anywhere in the sentence: "I thought: if I call…, I will know", "we always had leftovers",
 *  "that's the last time I'll see him leave" — a plan remembered is not a plan held. */
const PAST_RE = /\b(?:was|were|had|did|thought|used to|watched|noticed|remember(?:ed)?)\b|\b\w+'d\b/i;

const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+(?=[A-Z"'(])/;

/** The window a time word names, as fractions of the day: [start, end). */
function timeWindow(sentence: string): { dayOffset: number; from: number; to: number } | null {
  const s = sentence.toLowerCase();
  if (/\btomorrow (?:night|evening)\b/.test(s)) return { dayOffset: 1, from: 0.75, to: 1 };
  if (/\btomorrow morning\b/.test(s)) return { dayOffset: 1, from: 0.25, to: 0.5 };
  if (/\btomorrow\b/.test(s)) return { dayOffset: 1, from: 0, to: 1 };
  if (/\btonight\b|\bthis evening\b|\blater tonight\b/.test(s)) return { dayOffset: 0, from: 0.75, to: 1 };
  if (/\bthis afternoon\b/.test(s)) return { dayOffset: 0, from: 0.5, to: 0.75 };
  if (/\bthis morning\b/.test(s)) return { dayOffset: 0, from: 0.25, to: 0.5 };
  if (/\btoday\b/.test(s)) return { dayOffset: 0, from: 0, to: 1 };
  return null;
}

const NEGATION_RE = /\b(?:don't|do not|doesn't|never|not|rarely|seldom|no longer)\b/i;

/** The routine marker must sit in a clause where the being does something, not in one where it does not ("I don't think about it most days"). */
function cadenceOf(sentence: string): Cadence | null {
  const clause = sentence.split(/[,;—]|\bbut\b/i).find((c) => ROUTINE_RE.test(c));
  if (!clause || NEGATION_RE.test(clause) || !PRESENT_SELF_VERB_RE.test(clause)) return null;
  const m = clause.match(ROUTINE_RE)!;
  const w = m[1].toLowerCase();
  if (/night|evening/.test(w)) return 'nightly';
  if (/week/.test(w)) return 'weekly';
  if (/day|morning|afternoon|daily/.test(w)) return 'daily';
  return 'always';
}

function triggerOf(sentence: string): string | null {
  const m = sentence.match(TRIGGER_RE);
  if (!m) return null;
  const t = m[1].trim().replace(/\s+/g, ' ');
  return t.length >= 3 ? t : null;
}

/**
 * The intentions a stretch of a being's own words carries. Pure; deterministic.
 * `atCycle` is when the words were formed — "tonight" is that day's evening.
 */
export function extractIntentions(content: string, atCycle: number): IntentionDraft[] {
  const out: IntentionDraft[] = [];
  const seen = new Set<string>();
  const dayStart = Math.floor(atCycle / DAY_CYCLES) * DAY_CYCLES;
  for (const raw of content.split(SENTENCE_SPLIT_RE)) {
    const sentence = raw.trim();
    if (sentence.length < 8 || !SELF_RE.test(sentence) || PAST_RE.test(sentence)) continue;
    const resolve = RESOLVE_RE.test(sentence);
    const prospective = PROSPECTIVE_RE.test(sentence) || CONDITIONAL_PLAN_RE.test(sentence) || resolve;
    const cadence = cadenceOf(sentence);
    if (!prospective && !cadence) continue;
    // "I'll be there." has no doing of its own — a promise is not a plan (finding 63, 2026-11-05); promiseFromReply is the path.
    if (prospective && !cadence && isBareAssent(sentence)) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const window = prospective ? timeWindow(sentence) : null;
    // A resolve with no stated time is due NOW: the current cycle, a short window (finding 78).
    const nowWin = resolve && !window && !triggerOf(sentence) ? (relativeWindow(sentence, atCycle) ?? { dueCycle: atCycle, dueUntil: atCycle + 10 * MIN_CYCLES }) : null;
    out.push({
      description: sentence,
      trigger: triggerOf(sentence),
      dueCycle: window ? dayStart + (window.dayOffset + window.from) * DAY_CYCLES : nowWin ? nowWin.dueCycle : null,
      dueUntil: window ? dayStart + (window.dayOffset + window.to) * DAY_CYCLES : nowWin ? nowWin.dueUntil : null,
      cadence: prospective ? cadence : cadence,
    });
  }
  return out;
}

/** Why a pending intention is due now, or null. Pure. */
export function dueReason(i: Pick<IntentionDraft, 'trigger' | 'dueCycle' | 'dueUntil'>, cue: string, nowCycle: number, lead = 0): 'trigger' | 'time' | null {
  if (i.trigger && cue && cueCoverage(i.trigger, cue) >= 0.5) return 'trigger';
  // `lead` (finding 63, 2026-11-05): a meeting is due from dueCycle − the time it takes to get there.
  if (i.dueCycle !== null && i.dueUntil !== null && nowCycle >= i.dueCycle - lead &&nowCycle <= i.dueUntil) return 'time';
  return null;
}

/** A time-only intention is stale a day past its window; one that waits on a trigger is given a month. Pure. */
export function hasLapsed(i: Pick<IntentionDraft, 'trigger' | 'dueUntil' | 'cadence'>, nowCycle: number): boolean {
  if (i.cadence || i.dueUntil === null) return false;
  const grace = (i.trigger ? 30 : 1) * DAY_CYCLES;
  return nowCycle > i.dueUntil + grace;
}

/** The line the being's prompt gets for what it meant to do. Pure. */
export function intentionLine(due: Array<Pick<DueIntention, 'description'>>): string | null {
  if (!due.length) return null;
  return `What you meant to do: ${due.map((d) => d.description).join(' ')}`;
}

// ── Store ─────────────────────────────────────────────────────────────────────

/**
 * Note the intentions a new memory carries. One row per distinct sentence per
 * entity; a sentence already noted is left alone. Links the row to a vine when
 * the sentence touches one. Never throws outward.
 */
export async function noteIntentions(entityId: string, memoryId: string | null, content: string, atCycle: number): Promise<number> {
  const drafts = extractIntentions(content, atCycle);
  if (!drafts.length) return 0;
  let made = 0;
  try {
    const entity = await prisma.dayaEntity.findUnique({ where: { id: entityId }, select: { characterId: true } });
    const goals = entity ? await prisma.goal.findMany({ where: { characterId: entity.characterId, status: 'ACTIVE' }, select: { id: true, description: true } }) : [];
    for (const d of drafts) {
      const already = await prisma.dayaIntention.findFirst({ where: { entityId, description: d.description }, select: { id: true } });
      if (already) continue;
      const goalId = goalsTouched(d.description, goals)[0] ?? null;
      await prisma.dayaIntention.create({
        data: { entityId, description: d.description, trigger: d.trigger, dueCycle: d.dueCycle, dueUntil: d.dueUntil, cadence: d.cadence, goalId, sourceMemoryId: memoryId, narrativeCycle: atCycle },
      });
      made++;
    }
  } catch (err) {
    console.warn('[daya/intentions] noting intentions failed (non-fatal):', err);
  }
  return made;
}

/**
 * The pending intentions due now for this cue; stale ones are marked LAPSED on
 * the way. Never throws outward (an empty list is the safe answer).
 */
export async function dueIntentionsFor(entityId: string, cue: string, nowCycle: number): Promise<DueIntention[]> {
  try {
    const rows = await prisma.dayaIntention.findMany({ where: { entityId, status: 'PENDING' } });
    const stale = rows.filter((r) => hasLapsed({ trigger: r.trigger, dueUntil: r.dueUntil, cadence: r.cadence as Cadence | null }, nowCycle));
    if (stale.length) await prisma.dayaIntention.updateMany({ where: { id: { in: stale.map((r) => r.id) } }, data: { status: 'LAPSED' } });
    const staleIds = new Set(stale.map((r) => r.id));
    const due: DueIntention[] = [];
    for (const r of rows) {
      if (staleIds.has(r.id)) continue;
      const why = dueReason({ trigger: r.trigger, dueCycle: r.dueCycle, dueUntil: r.dueUntil }, cue, nowCycle, isMeeting(r.description) ? travelLeadCycles(r.description) : 0);
      if (why) due.push({ id: r.id, description: r.description, trigger: r.trigger, sourceMemoryId: r.sourceMemoryId, goalId: r.goalId, why, authority: authorityOf(r.authority), dueCycle: r.dueCycle, dueUntil: r.dueUntil });
    }
    return due;
  } catch (err) {
    console.warn('[daya/intentions] due intentions lookup failed (non-fatal):', err);
    return [];
  }
}

function authorityOf(raw: string | null | undefined): IntentionAuthority {
  return raw === 'player' || raw === 'gm' ? raw : 'self';
}

/** The being did it (or let it go). */
export async function settleIntention(id: string, status: 'DONE' | 'LAPSED'): Promise<void> {
  await prisma.dayaIntention.update({ where: { id }, data: { status } });
}

// ── Setting and completing (Mike 2026-10-25: "build a way for intentions to be completed and also how are they set?") ──
//
// HOW THEY ARE SET: derived from the being's own words whenever a memory is written (genesis seeds, what it
// perceives and says, its answers) — see noteIntentions above — or set outright with setIntention (the Watcher,
// JEWL, a script) in the same shape. HOW THEY ARE COMPLETED: when the being does the thing. Every act of its on
// the record (the Watcher voicing it, its own answer) is read against its pending intentions — first by the words
// (the act carries the intention's own doing), then, when the local lane is up, by the lane's judgment — and a
// carried-out intention is DONE.

export interface SetIntentionInput {
  description: string;
  trigger?: string | null;
  dueCycle?: number | null;
  dueUntil?: number | null;
  cadence?: Cadence | null;
  goalId?: string | null;
  /** Default 'self'. 'player' = the Trailblazer's stated plan for a span; 'gm' = the Watcher's override (it happens as written). */
  authority?: IntentionAuthority;
}

/** Set an intention outright, in the being's own words. Returns the row id (an identical pending one is reused). */
export async function setIntention(characterId: string, input: SetIntentionInput, atCycle: number): Promise<string> {
  const entity = await prisma.dayaEntity.findUniqueOrThrow({ where: { characterId }, select: { id: true } });
  const description = input.description.trim();
  const already = await prisma.dayaIntention.findFirst({ where: { entityId: entity.id, description, status: 'PENDING' }, select: { id: true } });
  if (already) return already.id;
  const row = await prisma.dayaIntention.create({
    data: {
      entityId: entity.id, description,
      trigger: input.trigger ?? triggerOf(description), dueCycle: input.dueCycle ?? null, dueUntil: input.dueUntil ?? null,
      cadence: input.cadence ?? cadenceOf(description), goalId: input.goalId ?? null, narrativeCycle: atCycle,
      authority: input.authority ?? 'self',
    },
  });
  return row.id;
}

/** What an intention says the being will DO: the words after its prospective marker, or the whole sentence. Pure. */
export function doingOf(description: string): string {
  const m = description.match(PROSPECTIVE_RE);
  if (m && m.index !== undefined) return description.slice(m.index + m[0].length).replace(/^[\s,]+/, '').replace(/[.!?]+$/, '').trim() || description;
  const cond = description.match(/^(?:and |but |then )?if\s+[^,]+,\s*(I\s+.+)$/i);
  if (cond) return cond[1].replace(/[.!?]+$/, '').trim();
  return description.replace(/[.!?]+$/, '').trim();
}

/**
 * Does this act carry out the intention, by the words alone? The act must carry most of the doing's content words
 * ("give it to him as the tip" ↔ "hands him the folded bill as the tip" fails on words alone — the lane judges that).
 * Pure.
 */
export function actCompletes(description: string, act: string): boolean {
  const doing = doingOf(description);
  // Nearly all of it, by the words (HW8 run 2: at 0.6, "I'm no longer pretending I'm waiting" closed "go to the shelter
  // on Fifth Street and adopt the cat, and I stop pretending"). Anything less is the judge's call.
  return cueCoverage(doing, act) >= ACT_WORDS_FLOOR;
}
const ACT_WORDS_FLOOR = 0.85;

/**
 * Read a being's act against its pending intentions and mark the carried-out ones DONE. The words first; then,
 * when a judge is given (the local lane), its yes/no on the rest. Returns the settled rows. Never throws outward.
 */
export async function settleIntentionsByAct(
  characterId: string,
  act: string,
  judge?: (pending: Array<{ id: string; description: string }>, act: string) => Promise<string[]>,
): Promise<Array<{ id: string; description: string }>> {
  try {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
    if (!entity || !act.trim()) return [];
    const pending = await prisma.dayaIntention.findMany({ where: { entityId: entity.id, status: 'PENDING', cadence: null }, select: { id: true, description: true } });
    if (!pending.length) return [];
    const done = new Set(pending.filter((p) => actSettles(p.description, act)).map((p) => p.id));
    const rest = pending.filter((p) => !done.has(p.id));
    if (judge && rest.length) {
      try { for (const id of await judge(rest, act)) if (rest.some((p) => p.id === id)) done.add(id); }
      catch (err) { console.warn('[daya/intentions] the judge could not read the act (non-fatal):', err instanceof Error ? err.message : err); }
    }
    if (!done.size) return [];
    await prisma.dayaIntention.updateMany({ where: { id: { in: [...done] } }, data: { status: 'DONE' } });
    const settled = pending.filter((p) => done.has(p.id));
    for (const s of settled) console.log(`[daya/intentions] DONE for ${characterId}: "${s.description.slice(0, 90)}" ← act: "${act.slice(0, 90)}"`);
    return settled;
  } catch (err) {
    console.warn('[daya/intentions] settling by act failed (non-fatal):', err instanceof Error ? err.message : err);
    return [];
  }
}

// ── Promises, meetings and the clock (finding 63, 2026-11-05) ────────────────────
//
// Kristopher texted "Meet me at the coffee shop in 15 minutes or so?"; Violet wrote back "I'll be there." The engine
// stored "I'll be there." and marked it DONE at once — her own text carried the same words. No pending intention with
// a due time existed, so she never went. A promise is not a plan: the reply becomes a meeting intention with a clock
// (promiseFromReply), and speaking it never keeps it (actKeepsPromise) — only arriving does.

const MIN_CYCLES = DAY_CYCLES / 1440;
const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, 'forty five': 45,
};
const NUM_ALT = '\\d{1,2}|forty[- ]five|fifteen|twelve|eleven|twenty|thirty|three|seven|eight|four|five|nine|one|two|six|ten';
const NUM = `(${NUM_ALT})`;

function numValue(tok: string): number {
  const t = tok.toLowerCase().replace('-', ' ');
  return /^\d+$/.test(t) ? parseInt(t, 10) : NUM_WORDS[t] ?? NaN;
}

export interface RelativeWindow {
  dueCycle: number;
  dueUntil: number;
  /** The time words as a being would carry them: "in ten minutes", "tomorrow at four", "tonight". */
  words: string;
  /** A point time (the moment itself) when the words name one; the window is [point − 5 min, point + 60 min]. */
  pointCycle?: number;
}

function pointWindow(point: number, words: string): RelativeWindow {
  return { dueCycle: point - 5 * MIN_CYCLES, dueUntil: point + 60 * MIN_CYCLES, words, pointCycle: point };
}

function inMinutes(s: string): { minutes: number; words: string } | null {
  let m: RegExpMatchArray | null;
  if (/\bin\s+half an hour\b/i.test(s)) return { minutes: 30, words: 'in half an hour' };
  if ((m = s.match(/\bin\s+(?:an|one|a)\s+(hour|minute)\b/i))) {
    const hour = /^h/i.test(m[1]);
    return { minutes: hour ? 60 : 1, words: hour ? 'in an hour' : 'in a minute' };
  }
  if ((m = s.match(/\bin\s+(?:a\s+)?couple\s+(?:of\s+)?(hours?|minutes?)\b/i))) return { minutes: 2 * (/^h/i.test(m[1]) ? 60 : 1), words: `in a couple of ${m[1].toLowerCase()}` };
  if ((m = s.match(/\bin\s+a\s+few\s+(hours?|minutes?)\b/i))) return { minutes: 3 * (/^h/i.test(m[1]) ? 60 : 1), words: `in a few ${m[1].toLowerCase()}` };
  m = s.match(new RegExp(`\\bin\\s+(?:about\\s+|around\\s+)?${NUM}(?:\\s*-?\\s*(minutes?|mins?|hours?|hrs?))?(?:-?ish)?(?![\\w])`, 'i'));
  if (!m || m.index === undefined) return null;
  const n = numValue(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2];
  if (!unit) {
    // "in ten" = minutes; but "in two days" / "in one piece" is not a clock.
    if (/^\s+(?!or so\b)[a-z]/i.test(s.slice(m.index + m[0].length)) || n > 60) return null;
    return { minutes: n, words: `in ${m[1].toLowerCase()} minutes` };
  }
  const hours = /^h/i.test(unit);
  if (hours && n > 12) return null;
  return { minutes: n * (hours ? 60 : 1), words: `in ${m[1].toLowerCase()} ${hours ? (n === 1 ? 'hour' : 'hours') : 'minutes'}` };
}

const CLOCK_AT_RE = new RegExp(`\\b(?:(tomorrow|tonight|today|this (?:morning|afternoon|evening))\\s+)?at\\s+(?:about\\s+|around\\s+)?${NUM}(?::(\\d\\d))?(?:\\s*o'?clock)?(?:\\s*([ap])\\.?m\\b\\.?)?(?![\\w])(?:\\s+(tomorrow|tonight|today))?`, 'i');
const CLOCK_BARE_RE = new RegExp(`\\b${NUM}(?::(\\d\\d))?\\s+(tomorrow|tonight)\\b|\\bdoes\\s+${NUM}(?::(\\d\\d))?\\s+work\\b`, 'i');

function clockWindow(s: string, atCycle: number): RelativeWindow | null {
  let day: string | undefined, tok: string, mm: string | undefined, ap: string | undefined;
  let m = s.match(CLOCK_AT_RE);
  if (m) { day = (m[1] ?? m[5])?.toLowerCase(); tok = m[2]; mm = m[3]; ap = m[4]?.toLowerCase(); }
  else {
    m = s.match(CLOCK_BARE_RE);
    if (!m) return null;
    if (m[1]) { tok = m[1]; mm = m[2]; day = m[3].toLowerCase(); } else { tok = m[4]; mm = m[5]; }
  }
  const h = numValue(tok);
  if (!Number.isFinite(h) || h > 23 || (h > 12 && !/^\d+$/.test(tok))) return null;
  let hour = h;
  if (ap) hour = (h % 12) + (ap === 'p' ? 12 : 0);
  else if (h >= 1 && h <= 6) hour = h + 12; // bare 1–6 reads as afternoon — assumed 2026-11-05
  else if (h >= 7 && h <= 11 && day && /tonight|evening/.test(day)) hour = h + 12;
  const dayStart = Math.floor(atCycle / DAY_CYCLES) * DAY_CYCLES;
  const minutes = mm ? parseInt(mm, 10) : 0;
  let point = dayStart + ((hour + minutes / 60) / 24) * DAY_CYCLES;
  if (day === 'tomorrow') point += DAY_CYCLES;
  else if (!day && point < atCycle) point += DAY_CYCLES; // the next occurrence of that hour
  const spoken = `${mm ? `${tok}:${mm}` : tok}${ap ? ` ${ap}m` : ''}`;
  return pointWindow(point, `${day && day !== 'today' ? `${day} ` : ''}at ${spoken}`.trim());
}

const SPAN_WORD_RE = /tomorrow (?:night|evening|morning)|tomorrow|tonight|this evening|this afternoon|this morning|today/i;

/**
 * The window RELATIVE time words name, from `atCycle` (the moment the words were said). Null when there are none.
 * A point time ("in 15 minutes or so", "at four") is [point − 5 min, point + 60 min] with `pointCycle` = the point; a
 * span word ("this afternoon") keeps the day-fraction windows; "later" / "soon" / "now" are loose windows. Pure.
 * (finding 63, 2026-11-05)
 */
export function relativeWindow(sentence: string, atCycle: number): RelativeWindow | null {
  const inm = inMinutes(sentence);
  if (inm) return pointWindow(atCycle + inm.minutes * MIN_CYCLES, inm.words);
  const clock = clockWindow(sentence, atCycle);
  if (clock) return clock;
  const tw = timeWindow(sentence);
  if (tw) {
    const dayStart = Math.floor(atCycle / DAY_CYCLES) * DAY_CYCLES;
    return { dueCycle: dayStart + (tw.dayOffset + tw.from) * DAY_CYCLES, dueUntil: dayStart + (tw.dayOffset + tw.to) * DAY_CYCLES, words: sentence.match(SPAN_WORD_RE)?.[0].toLowerCase() ?? 'today' };
  }
  if (/\bnow\b/i.test(sentence)) return { dueCycle: atCycle, dueUntil: atCycle + 10 * MIN_CYCLES, words: /\bright now\b/i.test(sentence) ? 'right now' : 'now' };
  if (/\bsoon\b/i.test(sentence)) return { dueCycle: atCycle + 30 * MIN_CYCLES, dueUntil: atCycle + 90 * MIN_CYCLES, words: 'soon' };
  if (/\blater\b/i.test(sentence)) return { dueCycle: atCycle + 30 * MIN_CYCLES, dueUntil: atCycle + 180 * MIN_CYCLES, words: 'later' };
  return null;
}

const TIME_ISH_RE = new RegExp(`^(?:\\d|${NUM_ALT}|tomorrow|tonight|today|morning|afternoon|evening|night|a (?:bit|while|minute|moment|few|couple)|an? hour|half|the (?:morning|afternoon|evening|night|meantime)|about|around|soon|later|now)\\b`, 'i');
const PLACE_CUT_RE = /\s+(?:in|at|tomorrow|tonight|today|this|around|about|or so|if|when|now|later|soon|so|because|and|but|before|after)\b|\s+(?=\d)/i;

/** The place a message names: the phrase after at / to / in, up to a time word or punctuation ("the coffee shop on Broadway"). Pure. */
export function placeOf(text: string): string | null {
  for (const m of text.matchAll(/\b(at|to|in)\s+([^.,?!;:()\n]+)/gi)) {
    const prep = m[1].toLowerCase();
    const before = text.slice(0, m.index ?? 0);
    if (prep === 'to' && !/\b(?:come|go|head|walk|over|down|up|back|meet me)\s+$/i.test(before)) continue;
    const cand = m[2].trim().split(PLACE_CUT_RE)[0].trim();
    if (!cand || TIME_ISH_RE.test(cand)) continue;
    if (prep === 'in' && !/^(?:the|a|an|[A-Z])/.test(cand)) continue;
    return cand;
  }
  return null;
}

const MEET_CUE_RE = /\b(?:meet|come|coffee|lunch|dinner|drinks?|see you|hang out|grab|get together|join|work for you|does .{1,30} work|free)\b/i;
const DECLINE_RE = /\b(?:can't|cant|cannot|can not|won't|not tonight|not today|not now|no|nope|nah|rain check|another time|some other time|sorry|i'm busy|maybe not|pass)\b/i;
const ASSENT_RE = /\b(?:yes|yeah|yep|yup|ok|okay|sure|deal|sounds (?:good|great)|see you(?: there| then| soon)?|on my way|omw|i(?:'ll| will) (?:be there|come|meet you|see you|be right there|be on my way|be)|i(?:'m| am) coming|i can be there|works for me|that works|perfect|absolutely|of course|definitely|alright)\b/i;

const norm = (t: string) => t.replace(/[‘’]/g, "'").trim();

/** "I'll be there." / "I'll come." / "See you there." — a promise with no doing of its own. Pure. */
export function isBareAssent(sentence: string): boolean {
  const doing = doingOf(norm(sentence)).toLowerCase();
  return /^(?:be (?:right )?there|come|come over|be on my way|see you(?: there| then)?|meet you(?: there)?)(?:\s+(?:soon|then|tonight|tomorrow|later|in .+|at .+))?$/.test(doing);
}

/** The meeting intention a reply makes, when it assents to a proposal of one in `asked`. Null otherwise. Pure. */
export function promiseFromReply(reply: string, asked: string, atCycle: number): IntentionDraft | null {
  const r = norm(reply), a = norm(asked);
  if (!r || !a || r.includes('?')) return null;
  if (DECLINE_RE.test(r.replace(/\bno problem\b/i, ''))) return null;
  const replyWin = relativeWindow(r, atCycle);
  const askedWin = relativeWindow(a, atCycle);
  const place = placeOf(a);
  if (!MEET_CUE_RE.test(a) || (!place && !askedWin)) return null;
  const wordCount = r.split(/\s+/).length;
  const assent = wordCount <= 14 && ASSENT_RE.test(r);
  const counterTimeAlone = !assent && !!replyWin && wordCount <= 6;
  if (!assent && !counterTimeAlone) return null;
  // A counter-time ("In ten.") wins; a vague reply ("soon") never overrides a clock the proposal named.
  const win = replyWin?.pointCycle !== undefined ? replyWin : askedWin ?? replyWin;
  const where = place ?? 'the meeting';
  if (!win) return { description: `be at ${where}`, trigger: null, dueCycle: atCycle + 15 * MIN_CYCLES, dueUntil: atCycle + 180 * MIN_CYCLES, cadence: null };
  return { description: `be at ${where} ${win.words}`, trigger: null, dueCycle: win.dueCycle, dueUntil: win.dueUntil, cadence: null };
}

/** A meeting intention: its doing is a place ("be at …"). Pure. */
export function isMeeting(description: string): boolean {
  return /^be at\b/i.test(doingOf(description));
}

/** The place of a meeting description, without the time words. Pure. */
function meetingPlace(description: string): string {
  const rest = doingOf(description).replace(/^be at\s+/i, '');
  const words = relativeWindow(rest, 0)?.words;
  const i = words ? rest.toLowerCase().indexOf(words.toLowerCase()) : -1;
  return (i > 0 ? rest.slice(0, i) : rest).trim();
}

const SPEECH_START_RE = /^\s*(?:she |he |they )?(?:says?|said|tells?|told|texts?|texted|writes?|wrote|replies|replied|answers?|calls?|messages?|whispers?|types?)\b/i;
const ARRIVE_RE = /\b(?:arrives?|arrived|walks? (?:into|in)|enters?|steps? (?:into|in)|sits? down|reaches|gets? to|pushes? (?:open )?the door|is (?:at|in))\b/i;

/**
 * Does this act KEEP a promise? Speaking it does not — a text or a line of speech never settles "be at …"; only a move
 * or an arrival at that place does. A non-meeting intention is not gated here (actCompletes judges it). Pure.
 * (finding 63, 2026-11-05)
 */
export function actKeepsPromise(description: string, act: string): boolean {
  if (!isMeeting(description)) return true;
  if (SPEECH_START_RE.test(act)) return false;
  const outside = act.replace(/["“][^"”]*["”]/g, ' ');
  if (!ARRIVE_RE.test(outside)) return false;
  const place = meetingPlace(description);
  return !place || cueCoverage(place, outside) >= 0.5;
}

/** Does the act settle the intention: a meeting by arrival, anything else by the words. Pure. */
export function actSettles(description: string, act: string): boolean {
  return isMeeting(description) ? actKeepsPromise(description, act) : actCompletes(description, act);
}

/** How early to leave for a meeting: ten minutes before it is due, by default. Pure. */
export function travelLeadCycles(_description?: string): number {
  return 10 * MIN_CYCLES;
}

/** The chooser-facing pair for the earliest due meeting ("leave for the coffee shop on Broadway"), or null. Pure. */
export function leaveForLine(due: DueIntention[], nowCycle: number): { label: string; deed: string } | null {
  const meetings = due
    .filter((d) => isMeeting(d.description) && (d.dueUntil == null || nowCycle <= d.dueUntil))
    .sort((x, y) => (x.dueCycle ?? Infinity) - (y.dueCycle ?? Infinity));
  if (!meetings.length) return null;
  const place = meetingPlace(meetings[0].description);
  if (!place) return null;
  return { label: `leave for ${place}`, deed: `leaves for ${place}` };
}

/**
 * FINDING 86 (2026-11-05): the place a thread says the other is at — the longest Location NAME of the campaign that the other's
 * messages mention ("I'm already here" plus "the coffee shop on Broadway" in the thread). Data-driven: only names from `locationNames`
 * match, never a keyword list; `exclude` (the being's own place) never matches. Returns the name as the Location has it, or null. Pure.
 */
export function placeFromThread(texts: string[], locationNames: string[], exclude: string[] = []): string | null {
  const flat = (t: string) => ` ${t.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const hay = texts.map(flat).join(' | ');
  const skip = new Set(exclude.map((x) => flat(x).trim()));
  let best: string | null = null;
  for (const name of locationNames) {
    const bare = flat(name).trim().replace(/^the /, '');
    if (bare.length < 3 || skip.has(flat(name).trim()) || skip.has(bare)) continue;
    if (hay.includes(` ${bare} `) && (!best || bare.length > best.replace(/^the /i, '').length)) best = name;
  }
  return best;
}

/** The travelling intention for a place: "be at <place>", due now with a window of an hour (a stretch carries the rest — keepAppointments). Pure. */
export function beAtPlaceIntention(place: string, atCycle: number): { description: string; dueCycle: number; dueUntil: number } {
  return { description: `be at ${place}`, dueCycle: atCycle, dueUntil: atCycle + 60 * MIN_CYCLES };
}
