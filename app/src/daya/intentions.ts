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

export interface DueIntention {
  id: string;
  description: string;
  trigger: string | null;
  sourceMemoryId: string | null;
  goalId: string | null;
  why: 'trigger' | 'time';
}

// ── Grammar of a prospective sentence (first person, future-leaning) ─────────

const PROSPECTIVE_RE = /\bI(?:'m| am) going to\b|\bI will\b|\bI'll\b|\bI plan to\b|\bI mean to\b|\bI intend to\b|\bI(?:'m| am) supposed to\b|\bI have to\b|\bI(?:'ve| have) decided to\b|\bI promised to\b|\bI(?:'m| am) meant to\b/i;
/** "If he doesn't, I go to the shelter" — a conditional present counts as a plan. */
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
    const prospective = PROSPECTIVE_RE.test(sentence) || CONDITIONAL_PLAN_RE.test(sentence);
    const cadence = cadenceOf(sentence);
    if (!prospective && !cadence) continue;
    const key = sentence.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const window = prospective ? timeWindow(sentence) : null;
    out.push({
      description: sentence,
      trigger: triggerOf(sentence),
      dueCycle: window ? dayStart + (window.dayOffset + window.from) * DAY_CYCLES : null,
      dueUntil: window ? dayStart + (window.dayOffset + window.to) * DAY_CYCLES : null,
      cadence: prospective ? cadence : cadence,
    });
  }
  return out;
}

/** Why a pending intention is due now, or null. Pure. */
export function dueReason(i: Pick<IntentionDraft, 'trigger' | 'dueCycle' | 'dueUntil'>, cue: string, nowCycle: number): 'trigger' | 'time' | null {
  if (i.trigger && cue && cueCoverage(i.trigger, cue) >= 0.5) return 'trigger';
  if (i.dueCycle !== null && i.dueUntil !== null && nowCycle >= i.dueCycle && nowCycle <= i.dueUntil) return 'time';
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
      const why = dueReason({ trigger: r.trigger, dueCycle: r.dueCycle, dueUntil: r.dueUntil }, cue, nowCycle);
      if (why) due.push({ id: r.id, description: r.description, trigger: r.trigger, sourceMemoryId: r.sourceMemoryId, goalId: r.goalId, why });
    }
    return due;
  } catch (err) {
    console.warn('[daya/intentions] due intentions lookup failed (non-fatal):', err);
    return [];
  }
}

/** The being did it (or let it go). */
export async function settleIntention(id: string, status: 'DONE' | 'LAPSED'): Promise<void> {
  await prisma.dayaIntention.update({ where: { id }, data: { status } });
}
