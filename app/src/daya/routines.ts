/**
 * ORDINARY COMPETENCE — procedural memory (Claude; ruled by Michael 2026-10-30).
 *
 * A being has three stores, as a person does: what happened (episodic), what is
 * true (semantic), and how things are done (procedural). The first two were
 * DayaMemoryEntry; this is the third. A ROUTINE is what the hands know: the
 * pizza every day — go, unlock, open, take, pay, tip, shut, lock. Nobody
 * deliberates the walk to the door, and the being must not either: eleven
 * hello worlds showed that a loop that deliberates everything, under seven
 * guards, settles on `stay`.
 *
 * Shape:
 *   - The ENDS of a routine are derived ONCE from the being's own words (its
 *     cadence and trigger intentions, the memories they came from, what it holds,
 *     who it knows) into the world's own op vocabulary — services/routine-derive.
 *     Never hand-written per character.
 *   - The MEANS are planned EVERY BEAT from the live map by `nextStep` below: a
 *     tiny backward planner over the preconditions world-apply already enforces
 *     (give needs the other in reach; reach through a door needs it open; a lock
 *     leaving the home is worked from inside; opening needs being at the door).
 *     Nothing is stored; if the Watcher opens the door himself the plan adapts.
 *   - The step runs through world-apply like any act (services/routine-run);
 *     the character colours it; the PLAYER (daya/player) may hold or break it
 *     with a reason the facts can check.
 *
 * Pure: no database, no model. Everything here is testable on a fixture.
 */
import type { ActEffect } from '@/services/world-apply';
import type { DoorState } from '@/lib/canvas-geometry';

// ── Ends: what a routine is for, in the world's vocabulary ────────────────────

export type RoutineEnd =
  /** The being holds the thing (took it, or was handed it). */
  | { kind: 'hold'; item: string }
  /** The thing is in that person's hands (handed over by the being). */
  | { kind: 'gave'; item: string; to: string }
  /** A door stands in that state ("the way out" = the door that leaves the home). */
  | { kind: 'door'; door: string; state: DoorState }
  /** The being stands in that room, or beside that thing. */
  | { kind: 'at'; place: string };

export interface RoutineDraft {
  name: string;
  triggers: string[];
  cadence: 'daily' | 'nightly' | 'weekly' | 'always' | null;
  ends: RoutineEnd[];
  sourceIntentionIds: string[];
}

// ── The world as the planner sees it (built by services/routine-world) ────────

export type Reach = 'here' | 'through-open' | 'beyond-door' | 'far' | 'none';

export interface RoutineWorld {
  actor: { id: string; name: string; sex?: string | null; roomId: string | null; roomName: string | null };
  doors: Array<{
    id: string; name: string; state: DoorState; between: string[];
    /** Locked, but the deadbolt is under the actor's hand (leaves the home the actor stands in). */
    mine: boolean;
    /** The door that leaves the home from here — "the door", unnamed. */
    wayOut: boolean;
    touchesMyRoom: boolean;
    /** From the actor to the door, in feet; null when unplaced. */
    distanceFt: number | null;
  }>;
  things: Array<{ id: string; name: string; holderId: string | null; holderName: string | null; roomId: string | null; distanceFt: number | null }>;
  people: Array<{ id: string; name: string; roomId: string | null; roomName: string | null; reach: Reach; doorBetween?: string }>;
}

export interface RoutineStep {
  /** The world op, or a wait on something only the world can give (a thing in another's hands). */
  effect: ActEffect | { op: 'wait'; for: string };
  /** The act in the third person, as the engine says it: "goes to the Entry door". */
  act: string;
  /** The same as the being's own hands would know it, second person: "go to the Entry door". */
  step: string;
  /** Why this step, outermost end first. */
  because: string[];
  /** The index of the end it serves. */
  endIndex: number;
}

/** Within arm's reach of a door or a thing, in feet. */
export const REACH_FT = 4;

// ── Matching names loosely (the model names things as it likes) ───────────────

const norm = (s: string) => s.trim().toLowerCase().replace(/^(the|a|an|her|his|their|my)\s+/, '').replace(/[.!?,]+$/, '');
const head = (s: string) => { const w = norm(s).replace(/\s*\(.*$/, '').split(/\s+/); return w[w.length - 1] ?? ''; };
/** "the X" without doubling an article the name already carries ("The charcoal coat" → "the charcoal coat"). */
const the = (name: string) => (/^(the|a|an|her|his|their|my)\s/i.test(name.trim()) ? name.trim().charAt(0).toLowerCase() + name.trim().slice(1) : `the ${name.trim()}`);

export function pickByName<T extends { name: string }>(ref: string, rows: T[]): T | null {
  const r = norm(ref);
  if (!r) return null;
  return rows.find((x) => norm(x.name) === r)
    ?? rows.find((x) => norm(x.name).includes(r))
    ?? rows.find((x) => r.includes(norm(x.name)))
    ?? rows.find((x) => head(x.name).length >= 3 && (head(x.name) === head(r) || r.includes(head(x.name))))
    ?? null;
}

function pickDoor(ref: string, world: RoutineWorld) {
  const r = norm(ref);
  if (!r || /^(way out|door|front door|entry|the door)$/.test(r) || /way out/.test(r)) return world.doors.find((d) => d.wayOut) ?? world.doors.find((d) => d.touchesMyRoom) ?? null;
  return pickByName(ref, world.doors) ?? world.doors.find((d) => d.between.some((b) => norm(b) === r)) ?? null;
}

function pickPerson(ref: string, world: RoutineWorld) {
  const p = pickByName(ref, world.people);
  if (p) return p;
  // A role, not a name ("the driver", "the caller"): the one other person within reach, when there is exactly one.
  const near = world.people.filter((x) => x.reach === 'here' || x.reach === 'through-open' || x.reach === 'beyond-door');
  return near.length === 1 ? near[0] : null;
}

// ── Is an end met? ────────────────────────────────────────────────────────────

export function endMet(end: RoutineEnd, world: RoutineWorld): boolean {
  switch (end.kind) {
    case 'hold': { const t = pickByName(end.item, world.things); return !!t && t.holderId === world.actor.id; }
    case 'gave': { const t = pickByName(end.item, world.things); const p = pickPerson(end.to, world); return !!t && !!p && t.holderId === p.id; }
    case 'door': { const d = pickDoor(end.door, world); return !!d && d.state === end.state; }
    case 'at': {
      if (world.actor.roomName && norm(world.actor.roomName) === norm(end.place)) return true;
      const t = pickByName(end.place, world.things);
      return !!t && t.distanceFt !== null && t.distanceFt <= REACH_FT;
    }
  }
}

/** An end the world cannot satisfy (nothing by that name): skipped, not planned for. */
export function endPossible(end: RoutineEnd, world: RoutineWorld): boolean {
  switch (end.kind) {
    case 'hold': return !!pickByName(end.item, world.things);
    case 'gave': return !!pickByName(end.item, world.things);
    case 'door': return !!pickDoor(end.door, world);
    case 'at': return true;
  }
}

// ── The planner: the first unmet end, and the next step toward it ─────────────

/** The subject pronoun and its verb for "means": she means / he means / they mean. */
const who = (sex: string | null | undefined): { s: string; means: string } => (/^f/i.test(sex ?? '') ? { s: 'she', means: 'means' } : /^m/i.test(sex ?? '') ? { s: 'he', means: 'means' } : { s: 'they', means: 'mean' });

type Chain = { effect: RoutineStep['effect']; act: string; step: string; because: string[] };

function toDoor(d: RoutineWorld['doors'][number], world: RoutineWorld, because: string[]): Chain {
  const { s } = who(world.actor.sex);
  if (d.distanceFt === null || d.distanceFt > REACH_FT) {
    return { effect: { op: 'move', to: d.name }, act: `goes to ${the(d.name)}`, step: `go to ${the(d.name)}`, because: [...because, `to work ${the(d.name)} ${s} must be at it`] };
  }
  return { effect: { op: 'door', door: d.name, state: 'open' }, act: d.state === 'locked' ? `turns the lock and opens ${the(d.name)}` : `opens ${the(d.name)}`, step: d.state === 'locked' ? `turn the lock and open ${the(d.name)}` : `open ${the(d.name)}`, because };
}

/** The way to a person who is not in reach: through the door between, else toward them. */
function toPerson(p: RoutineWorld['people'][number], world: RoutineWorld, because: string[]): Chain | null {
  if (p.reach === 'beyond-door') {
    const d = (p.doorBetween && pickDoor(p.doorBetween, world)) || world.doors.find((x) => x.wayOut) || null;
    if (!d) return null;
    return toDoor(d, world, [...because, `${p.name} is beyond ${the(d.name)}: it must be open`]);
  }
  if (p.reach === 'far') return { effect: { op: 'move', to: p.name }, act: `goes to ${p.name}`, step: `go to ${p.name}`, because: [...because, `${p.name} is not within reach`] };
  return null;
}

function stepToward(end: RoutineEnd, world: RoutineWorld): Chain | null {
  const { s, means } = who(world.actor.sex);
  switch (end.kind) {
    case 'hold': {
      const t = pickByName(end.item, world.things);
      if (!t) return null;
      const because = [`${s} ${means} to have ${the(t.name)}`];
      if (!t.holderId) {
        if (t.roomId && t.roomId === world.actor.roomId) {
          if (t.distanceFt !== null && t.distanceFt > REACH_FT) return { effect: { op: 'move', to: t.name }, act: `goes to ${the(t.name)}`, step: `go to ${the(t.name)}`, because };
          return { effect: { op: 'take', item: t.name }, act: `takes ${the(t.name)}`, step: `take ${the(t.name)}`, because };
        }
        return null;
      }
      const p = world.people.find((x) => x.id === t.holderId);
      if (!p) return null;
      if (p.reach === 'here' || p.reach === 'through-open') {
        return { effect: { op: 'wait', for: `${the(t.name)} from ${p.name}` }, act: `waits, hands ready, for ${the(t.name)}`, step: `take ${the(t.name)} when ${p.name} hands it over`, because: [...because, `${p.name} has it`] };
      }
      return toPerson(p, world, [...because, `${p.name} has it`]);
    }
    case 'gave': {
      const t = pickByName(end.item, world.things);
      if (!t) return null;
      const p = pickPerson(end.to, world);
      const because = [`${s} ${means} to hand over ${the(t.name)}${p ? ` to ${p.name}` : ''}`];
      if (t.holderId !== world.actor.id) {
        if (!t.holderId && t.roomId === world.actor.roomId) {
          if (t.distanceFt !== null && t.distanceFt > REACH_FT) return { effect: { op: 'move', to: t.name }, act: `goes to ${the(t.name)}`, step: `go to ${the(t.name)}`, because };
          return { effect: { op: 'take', item: t.name }, act: `takes ${the(t.name)}`, step: `take ${the(t.name)}`, because };
        }
        return null;
      }
      if (!p) return null;
      if (p.reach === 'here' || p.reach === 'through-open') return { effect: { op: 'give', item: t.name, to: p.name }, act: `hands ${the(t.name)} to ${p.name}`, step: `hand ${the(t.name)} to ${p.name}`, because };
      return toPerson(p, world, because);
    }
    case 'door': {
      const d = pickDoor(end.door, world);
      if (!d) return null;
      const because = [`${s} ${means} ${the(d.name)} ${end.state}`];
      if (d.distanceFt === null || d.distanceFt > REACH_FT) return { effect: { op: 'move', to: d.name }, act: `goes to ${the(d.name)}`, step: `go to ${the(d.name)}`, because: [...because, `to work ${the(d.name)} ${s} must be at it`] };
      if (end.state === 'open') return { effect: { op: 'door', door: d.name, state: 'open' }, act: d.state === 'locked' ? `turns the lock and opens ${the(d.name)}` : `opens ${the(d.name)}`, step: d.state === 'locked' ? `turn the lock and open ${the(d.name)}` : `open ${the(d.name)}`, because };
      if (end.state === 'closed') return { effect: { op: 'door', door: d.name, state: 'closed' }, act: `shuts ${the(d.name)}`, step: `shut ${the(d.name)}`, because };
      return { effect: { op: 'door', door: d.name, state: 'locked' }, act: d.state === 'open' ? `shuts and locks ${the(d.name)}` : `locks ${the(d.name)}`, step: d.state === 'open' ? `shut and lock ${the(d.name)}` : `lock ${the(d.name)}`, because };
    }
    case 'at': {
      return { effect: { op: 'move', to: end.place }, act: `goes to the ${norm(end.place)}`, step: `go to the ${norm(end.place)}`, because: [`${s} ${means} to be at the ${norm(end.place)}`] };
    }
  }
}

/**
 * Where the instance stands: the first end from `cursor` on that is neither met nor impossible. Ends behind the cursor are
 * never revisited — a thing handed over is not fetched back. Pure.
 */
export function advanceCursor(ends: RoutineEnd[], world: RoutineWorld, cursor: number): number {
  let c = Math.max(0, cursor);
  while (c < ends.length && (!endPossible(ends[c], world) || endMet(ends[c], world))) c++;
  return c;
}

/** The next step of a routine against the live world from its cursor, or null when the ends from there are all met (done). */
export function nextStep(ends: RoutineEnd[], world: RoutineWorld, cursor = 0): RoutineStep | null {
  for (let i = advanceCursor(ends, world, cursor); i < ends.length; i++) {
    const end = ends[i];
    if (!endPossible(end, world) || endMet(end, world)) continue;
    const c = stepToward(end, world);
    if (!c) continue; // nothing the being can do about it from here: the next end
    return { ...c, endIndex: i };
  }
  return null;
}

/** Every possible end from the cursor on is met. */
export function routineDone(ends: RoutineEnd[], world: RoutineWorld, cursor = 0): boolean {
  return advanceCursor(ends, world, cursor) >= ends.length;
}

/** A routine instance that has run this many steps without finishing is set down (something is wrong with the world or the plan). */
export const ROUTINE_STEP_CAP = 12;

// ── When a routine is called up ───────────────────────────────────────────────

const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '');

/** A trigger is in the cue when one of its words (stemmed) is: "knock" ↔ "knocks", "knocking". Pure. */
export function triggerInCue(triggers: string[], cue: string): string | null {
  const words = new Set((cue.toLowerCase().match(/[a-z']+/g) ?? []).map(stem));
  for (const t of triggers) {
    const parts = (t.toLowerCase().match(/[a-z']+/g) ?? []).map(stem).filter((p) => p.length >= 3);
    if (parts.length && parts.every((p) => words.has(p))) return t;
  }
  return null;
}

/** The hours a routine instance is given before it is set down unfinished (the pizza never came). */
export const ROUTINE_LAPSE_CYCLES = 1 / 365.25 / 24 * 2; // two hours

// ── Parsing what the deriver wrote ───────────────────────────────────────────

export function parseEnds(raw: unknown): RoutineEnd[] {
  if (!Array.isArray(raw)) return [];
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);
  const out: RoutineEnd[] = [];
  for (const e of raw.slice(0, 12)) {
    if (!e || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    switch (r.kind) {
      case 'hold': { const item = s(r.item); if (item) out.push({ kind: 'hold', item }); break; }
      case 'gave': { const item = s(r.item); const to = s(r.to); if (item && to) out.push({ kind: 'gave', item, to }); break; }
      case 'door': { const door = s(r.door) ?? 'the way out'; const state = s(r.state)?.toLowerCase(); if (state === 'open' || state === 'closed' || state === 'locked') out.push({ kind: 'door', door, state }); break; }
      case 'at': { const place = s(r.place); if (place) out.push({ kind: 'at', place }); break; }
      default: break;
    }
  }
  return out;
}

export function parseRoutineDrafts(raw: unknown): RoutineDraft[] {
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' && Array.isArray((raw as { routines?: unknown }).routines)) ? (raw as { routines: unknown[] }).routines : [];
  const out: RoutineDraft[] = [];
  for (const r of arr.slice(0, 12)) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, 80) : '';
    const ends = parseEnds(o.ends);
    if (!name || !ends.length) continue;
    const triggers = Array.isArray(o.triggers) ? o.triggers.filter((t): t is string => typeof t === 'string' && !!t.trim()).map((t) => t.trim().toLowerCase().slice(0, 40)).slice(0, 8) : [];
    const cadenceRaw = typeof o.cadence === 'string' ? o.cadence.toLowerCase() : '';
    const cadence = cadenceRaw === 'daily' || cadenceRaw === 'nightly' || cadenceRaw === 'weekly' || cadenceRaw === 'always' ? cadenceRaw : null;
    const sourceIntentionIds = Array.isArray(o.sourceIntentionIds) ? o.sourceIntentionIds.filter((x): x is string => typeof x === 'string') : [];
    out.push({ name, triggers, cadence, ends: normalizeEndOrder(ends), sourceIntentionIds });
  }
  return out;
}

/**
 * The hands' order, whatever order the deriver listed: a door that must open first; what is received; what is handed
 * over; where to be; a door shut or locked last. Stable within each group, so the deriver's "pay, then tip" holds. Pure.
 */
export function normalizeEndOrder(ends: RoutineEnd[]): RoutineEnd[] {
  const rank = (e: RoutineEnd): number => (e.kind === 'door' ? (e.state === 'open' ? 0 : 4) : e.kind === 'hold' ? 1 : e.kind === 'gave' ? 2 : 3);
  return ends.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e) - rank(b.e) || a.i - b.i).map((x) => x.e);
}

/** The ends in words, for the player's eyes: "hold the pizza; hand the cash to Kristopher; the way out locked". */
export function endsInWords(ends: RoutineEnd[], world?: RoutineWorld): string[] {
  return ends.map((e) => {
    const met = world ? endMet(e, world) : false;
    const tick = world ? (met ? '✓ ' : '· ') : '';
    switch (e.kind) {
      case 'hold': return `${tick}have the ${norm(e.item)}`;
      case 'gave': return `${tick}hand the ${norm(e.item)} to ${e.to}`;
      case 'door': return `${tick}the ${norm(e.door)} ${e.state}`;
      case 'at': return `${tick}be at the ${norm(e.place)}`;
    }
  });
}

/** The same, with the ends behind the cursor shown as passed. */
export function endsInWordsFrom(ends: RoutineEnd[], world: RoutineWorld, cursor: number): string[] {
  return endsInWords(ends, world).map((line, i) => (i < cursor ? line.replace(/^[✓·] /, '✓ ') : line));
}
