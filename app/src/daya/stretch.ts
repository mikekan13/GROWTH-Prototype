/**
 * LIVING A STRETCH — the pure part (Claude; ruled by Michael 2026-10-31:
 * "much of the simulation will be done when time moves like this. Don't cut
 * corners or hard prompt things. We need this solid.").
 *
 * A stated span of time ("two days later") is not a jump: the clock WALKS
 * through it in windows, and in every window each being does what is due —
 * its routines in their usual hour, the intentions whose time has come, one
 * account of its day toward its goals, sleep at night. This module decides
 * WHAT is due and WHEN, from the being's own rows and the clock. Nothing here
 * invents a time: a routine with no readable hour is never fired by the
 * clock, only by a cue that reaches the being.
 *
 * Pure: no database, no model. services/stretch-live.ts runs it.
 *
 * Rulings: [[ruling-time-jumps-require-simulation-all-characters-2026-10-24]],
 * [[intentions-layer-under-the-vines-2026-10-25]],
 * [[ruling-ordinary-competence-routines-player-rolls-2026-10-30]],
 * [[feedback-engine-dynamic-not-hard-prompted-2026-10-17]].
 */
import { DAY_CYCLES } from './intentions';

// ── Quarters of the local day ────────────────────────────────────────────────
// The same fractions the intention grammar uses for "tonight" (0.75–1) and
// "this morning" (0.25–0.5): one reckoning for when things are due.

export type Quarter = 'night' | 'morning' | 'afternoon' | 'evening';

export const QUARTERS: ReadonlyArray<{ name: Quarter; from: number; to: number }> = [
  { name: 'night', from: 0, to: 0.25 },
  { name: 'morning', from: 0.25, to: 0.5 },
  { name: 'afternoon', from: 0.5, to: 0.75 },
  { name: 'evening', from: 0.75, to: 1 },
];

/** The fraction of the local day a cycle falls at, 0 ≤ f < 1. */
export function dayFraction(cycle: number): number {
  const f = cycle / DAY_CYCLES - Math.floor(cycle / DAY_CYCLES);
  return f < 0 ? f + 1 : f;
}

export function quarterOf(cycle: number): Quarter {
  const f = dayFraction(cycle);
  return QUARTERS.find((q) => f >= q.from && f < q.to)?.name ?? 'evening';
}

/** The day index (whole local days since cycle 0) a cycle falls in. */
export function dayIndexOf(cycle: number): number {
  return Math.floor(cycle / DAY_CYCLES + 1e-9);
}

// ── Windows and the level of detail ──────────────────────────────────────────

/** How finely a span is lived (reality-simulation ruling: render distance). */
export type Grain = 'quarter' | 'day' | 'week';

export const GRAIN_QUARTER_MAX_DAYS = 4;
export const GRAIN_DAY_MAX_DAYS = 31;

export function grainFor(seconds: number): Grain {
  const days = seconds / 86400;
  if (days <= GRAIN_QUARTER_MAX_DAYS) return 'quarter';
  if (days <= GRAIN_DAY_MAX_DAYS) return 'day';
  return 'week';
}

export interface StretchWindow {
  /** Cycles. `start` is where the clock is set before the window is lived. */
  start: number;
  end: number;
  /** Which quarter this window is (grain 'quarter'); 'awake' = a whole waking day (grain 'day'); 'week' = seven days. */
  kind: Quarter | 'awake' | 'week';
  /** 0-based day of the stretch this window belongs to (a week window: its first day). */
  dayIndex: number;
  /** Local day index on the calendar (dayIndexOf(start)). */
  calendarDay: number;
  /** The window is a sleeping one (nothing fires but nightly routines; a dream tick). */
  sleep: boolean;
}

/** Local seconds in a window (standard reckoning). */
export function windowSeconds(w: Pick<StretchWindow, 'start' | 'end'>): number {
  return ((w.end - w.start) / DAY_CYCLES) * 86400;
}

/**
 * Cut [start, end) into windows. Quarter grain: the rest of the current quarter, every whole quarter, the part of the
 * last one. Day grain: a night window (0–0.25) and one awake window (0.25–1) per day. Week grain: seven-day windows.
 * Windows shorter than a minute are dropped (a stated span that ends exactly on a boundary). Pure.
 */
export function windowsFor(start: number, end: number, grain: Grain = grainFor(((end - start) / DAY_CYCLES) * 86400)): StretchWindow[] {
  if (!(end > start)) return [];
  const out: StretchWindow[] = [];
  const firstDay = dayIndexOf(start);
  const push = (s: number, e: number, kind: StretchWindow['kind'], sleep: boolean) => {
    const S = Math.max(s, start), E = Math.min(e, end);
    if (E - S < DAY_CYCLES / 1440) return; // under a minute
    out.push({ start: S, end: E, kind, dayIndex: dayIndexOf(S) - firstDay, calendarDay: dayIndexOf(S), sleep });
  };
  if (grain === 'week') {
    for (let s = start; s < end; s += 7 * DAY_CYCLES) push(s, s + 7 * DAY_CYCLES, 'week', false);
    return out;
  }
  for (let day = firstDay; day * DAY_CYCLES < end; day++) {
    const d0 = day * DAY_CYCLES;
    if (grain === 'day') {
      push(d0, d0 + 0.25 * DAY_CYCLES, 'night', true);
      push(d0 + 0.25 * DAY_CYCLES, d0 + DAY_CYCLES, 'awake', false);
      continue;
    }
    for (const q of QUARTERS) push(d0 + q.from * DAY_CYCLES, d0 + q.to * DAY_CYCLES, q.name, q.name === 'night');
  }
  return out;
}

/** "the rest of the evening of day 1", "the night into day 2", "the morning of day 2" — for logs and the record. Pure. */
export function windowLabel(w: StretchWindow, totalDays: number): string {
  const day = `day ${w.dayIndex + 1}${totalDays > 1 ? ` of ${totalDays}` : ''}`;
  if (w.kind === 'week') return `the week from ${day}`;
  if (w.kind === 'awake') return `the day, ${day}`;
  if (w.kind === 'night') return `the night, ${day}`;
  return `the ${w.kind}, ${day}`;
}

// ── A routine's usual hour, read from the being's own words ──────────────────

/** Time words in a cadence sentence → the quarter they name. "every evening" → evening; "most mornings" → morning. Pure. */
export function quarterInWords(sentence: string): Quarter | null {
  const s = sentence.toLowerCase();
  if (/\b(evening|evenings|tonight|dusk|after work|at dinner|dinner ?time|suppertime|at supper)\b/.test(s)) return 'evening';
  if (/\b(night|nights|nightly|before bed|at bedtime|midnight|the small hours)\b/.test(s)) return 'night';
  if (/\b(morning|mornings|at breakfast|breakfast ?time|at dawn|first thing|when i wake|when i get up)\b/.test(s)) return 'morning';
  if (/\b(afternoon|afternoons|at lunch|lunch ?time|midday|noon)\b/.test(s)) return 'afternoon';
  return null;
}

export interface RoutineForStretch {
  id: string;
  name: string;
  cadence: 'daily' | 'nightly' | 'weekly' | 'always' | null;
  status: string;
  lastDoneCycle: number | null;
  /** The sentences the routine was read from (its source intentions' descriptions). */
  sourceDescriptions: string[];
}

/**
 * When a cadence routine usually runs: (i) a time word in its own sentences; (ii) the quarter of its last run;
 * (iii) `nightly` with nothing else → night; else null = the clock never fires it (only a cue does). Pure.
 */
export function usualQuarterOf(r: Pick<RoutineForStretch, 'cadence' | 'lastDoneCycle' | 'sourceDescriptions'>): Quarter | null {
  if (!r.cadence || r.cadence === 'always') return null;
  for (const s of r.sourceDescriptions) { const q = quarterInWords(s); if (q) return q; }
  if (r.lastDoneCycle !== null && r.lastDoneCycle !== undefined) return quarterOf(r.lastDoneCycle);
  if (r.cadence === 'nightly') return 'night';
  return null;
}

/** The period of a cadence in cycles; `always` has none. Pure. */
export function cadencePeriod(cadence: RoutineForStretch['cadence']): number | null {
  switch (cadence) {
    case 'daily': case 'nightly': return DAY_CYCLES;
    case 'weekly': return 7 * DAY_CYCLES;
    default: return null;
  }
}

/**
 * The moment inside a window at which a routine with this usual quarter runs: the window's own start for a quarter
 * window; the start of that quarter within the window's day for a whole-day or week window (clamped into the window). Pure.
 */
export function fireCycleIn(window: StretchWindow, usual: Quarter): number {
  if (window.kind !== 'awake' && window.kind !== 'week') return window.start;
  const q = QUARTERS.find((x) => x.name === usual)!;
  const at = window.calendarDay * DAY_CYCLES + q.from * DAY_CYCLES;
  return Math.min(Math.max(at, window.start), window.end);
}

/**
 * The cadence routines the CLOCK calls up in this window: READY (or DONE long enough ago to be ready again), with a usual
 * quarter that this window covers, and not run within the half period before the moment it would fire. In a whole-day
 * window every quarter but night counts; in a week window every routine with a known hour counts (the runtime fires it
 * once per day of the week). Pure.
 */
export function routinesDueIn(window: StretchWindow, routines: RoutineForStretch[]): Array<RoutineForStretch & { fireAt: number }> {
  const out: Array<RoutineForStretch & { fireAt: number }> = [];
  for (const r of routines) {
    if (r.status !== 'READY' && r.status !== 'DONE') continue;
    const period = cadencePeriod(r.cadence);
    if (period === null) continue;
    const usual = usualQuarterOf(r);
    if (!usual) continue;
    const covers = window.kind === 'week' || (window.kind === 'awake' ? usual !== 'night' : window.kind === usual);
    if (!covers) continue;
    const fireAt = fireCycleIn(window, usual);
    if (r.lastDoneCycle !== null && r.lastDoneCycle !== undefined && fireAt - r.lastDoneCycle < period / 2) continue;
    out.push({ ...r, fireAt });
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}

// ── What the hour may not do: take from another's hands ──────────────────────

/**
 * A routine the HOUR calls up (nobody knocked, nothing was handed over) must not go after a thing that is in someone
 * else's hands — his "have the pizza" when the only pizza in the world is the one he delivered to her last night. That
 * is the world lacking a fresh one (a stock at the pizza place), not a reason to knock and take it back. Returns the
 * ends that would need another's hands, so the stretch can set the routine down and report what the world lacks. Pure.
 */
export function endsNeedingAnothersHands(
  ends: Array<{ kind: string; item?: string }>,
  things: Array<{ name: string; holderId: string | null; holderName: string | null; roomId: string | null }>,
  actorId: string,
  pick: (ref: string, rows: Array<{ name: string; holderId: string | null; holderName: string | null; roomId: string | null }>) => { name: string; holderId: string | null; holderName: string | null; roomId: string | null } | null,
): Array<{ item: string; holder: string }> {
  const out: Array<{ item: string; holder: string }> = [];
  for (const e of ends) {
    if ((e.kind !== 'hold' && e.kind !== 'gave') || !e.item) continue;
    const t = pick(e.item, things);
    if (!t) continue;
    const lying = things.some((x) => x.name === t.name && !x.holderId && x.roomId);
    if (t.holderId && t.holderId !== actorId && !lying) out.push({ item: t.name, holder: t.holderName ?? 'someone' });
  }
  return out;
}

// ── The account: when in the day a being gives its own account ───────────────

/**
 * The window in which a being gives its account of the day: the first awake window of that day with nothing of its
 * own due, else the last awake window. Pure. `dueByWindow` is indexed like `windows`.
 */
export function accountWindowIndex(windows: StretchWindow[], dayIndex: number, dueByWindow: number[]): number | null {
  const awake = windows.map((w, i) => ({ w, i })).filter(({ w }) => w.dayIndex === dayIndex && !w.sleep);
  if (!awake.length) return null;
  const free = awake.find(({ i }) => (dueByWindow[i] ?? 0) === 0);
  return (free ?? awake[awake.length - 1]).i;
}

// ── Directives: what a Trailblazer says their character does; what the GM overrides ──

export type DirectiveAuthority = 'player' | 'gm';

export interface StretchDirective {
  /** The character, by id or name (the runtime resolves it). */
  character: string;
  /** 'player' = the Trailblazer's stated intention for the span (the being pursues it, the world adjudicates);
   *  'gm' = the Watcher's override: it HAPPENS as written (narrated), no roll. */
  authority: DirectiveAuthority;
  /** In the first person as the player would say it, or as the Watcher states it. */
  text: string;
}

// ── The record: a day in words, built from the acts ──────────────────────────

export interface DayRecord {
  dayIndex: number;
  calendarDay: number;
  /** What the world saw the being do, in the engine's words, in order ("goes to the Entry door", "hands the pizza to Violet"). */
  acts: string[];
  /** What the being said, in order ("Kristopher: Evening."). */
  said: string[];
  /** The being's own account of the day (first person), when it gave one. */
  account?: string;
  /** What the world made of that account (the adjudicator's outcome). */
  outcome?: string;
  /** Intentions the day settled. */
  intentionsDone: string[];
  /** Routines that ran to their end. */
  routinesDone: string[];
  /** Steps the player behind the character held or broke from, with the reason ("stays — the knock was not for her"). */
  held?: string[];
  /** What the world refused (a move to a place not on the map) — JEWL reads these to see what the world lacks. */
  refused: string[];
  /** The being slept and dreamed. */
  dreamed?: boolean;
}

/** Joins acts into one sentence per being without a model: "She went to the Entry door, turned the lock and opened it, …". Pure. */
export function actsInProse(name: string, acts: string[]): string {
  if (!acts.length) return '';
  const past = acts.map(pastTense);
  return `${name} ${joinList(past)}.`;
}

/** Third-person-present → past for the engine's own act verbs. Only verbs the planner and world-apply emit. Pure. */
export function pastTense(act: string): string {
  return act
    .replace(/^goes to\b/, 'went to').replace(/^turns the lock and opens\b/, 'turned the lock and opened').replace(/^opens\b/, 'opened')
    .replace(/^shuts and locks\b/, 'shut and locked').replace(/^shuts\b/, 'shut').replace(/^locks\b/, 'locked')
    .replace(/^takes\b/, 'took').replace(/^hands\b/, 'handed').replace(/^puts\b/, 'put').replace(/^knocks\b/, 'knocked')
    .replace(/^waits\b/, 'waited').replace(/^walks\b/, 'walked').replace(/^leaves\b/, 'left').replace(/^arrives\b/, 'arrived')
    .replace(/^calls\b/, 'called').replace(/^sits\b/, 'sat').replace(/^works\b/, 'worked');
}

function joinList(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** The day's paragraph for the record: the acts in prose, what was said, the being's own account. Pure. */
export function dayParagraph(name: string, rec: DayRecord): string {
  const parts: string[] = [];
  const prose = actsInProse(name, rec.acts);
  if (prose) parts.push(prose);
  if (rec.said.length) parts.push(rec.said.join(' '));
  if (rec.account) parts.push(`In ${possessive(name)} own words: ${rec.account}`);
  if (rec.outcome && rec.outcome !== rec.account) parts.push(rec.outcome);
  if (rec.dreamed) parts.push(`${name} slept.`);
  if (!parts.length) return `${name}: nothing of note.`;
  return parts.join(' ');
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}
