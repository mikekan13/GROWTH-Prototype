/**
 * LIVING A STRETCH — the runtime (Claude; ruled by Michael 2026-10-31).
 *
 * "Two days later" is not a jump. The clock WALKS the span in windows
 * (daya/stretch.ts: quarters of the day for a few days, days for a month,
 * weeks beyond). In every window each crystallized character does what is
 * due: its routines in their usual hour (the hands, through the same planner
 * and world-apply the table uses), the intentions whose time has come, one
 * account of its day toward its goals (its own listen and answer, adjudicated
 * against facts and map), sleep at night with a dream tick. One being's act
 * reaches another as a cue (a knock at her door calls up her own routine);
 * two beings within reach may speak, a few lines. Trailblazers' stated
 * intentions for the span and the Watcher's overrides come in as directives
 * (intentions with authority 'player' / 'gm'; a gm one HAPPENS as written).
 *
 * Every memory lands at the moment it happened because the clock is really
 * there when it is written. One history line and one sweep at the end.
 *
 * Nothing here says what any character does: the data does (its rows, the
 * map, the clock), the planner derives the hands, the being speaks for itself.
 *
 * Rulings: [[ruling-time-jumps-require-simulation-all-characters-2026-10-24]],
 * [[intentions-layer-under-the-vines-2026-10-25]],
 * [[ruling-ordinary-competence-routines-player-rolls-2026-10-30]],
 * [[feedback-engine-dynamic-not-hard-prompted-2026-10-17]],
 * [[feedback-movement-never-charges-the-clock-2026-10-28]].
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { isDayaEnabled } from '@/daya/events';
import { listenAtTable, answerAsk, type ListenResult } from '@/daya/ensemble';
import { resolveIntent } from '@/daya/adjudicator';
import { wake } from '@/daya/events';
import { runDreamConsolidation } from '@/daya/scheduler';
import { resolveDayaEntityId } from '@/daya/entity';
import { dueIntentionsFor, setIntention, settleIntentionsByAct, settleIntention, intentionLine, type DueIntention } from '@/daya/intentions';
import { judgeIntentionsDone } from '@/daya/intention-judge';
import { currentFacts } from '@/daya/world-ledger';
import type { FactLine } from '@/daya/claim-vs-fact';
import {
  windowsFor, grainFor, routinesDueIn, accountWindowIndex, windowLabel, dayParagraph, actsInProse, endsNeedingAnothersHands,
  type StretchWindow, type StretchDirective, type DayRecord, type RoutineForStretch, type Grain,
} from '@/daya/stretch';
import { pickByName } from '@/daya/routines';
import { callUpRoutine, replanRoutine, runRoutineStep, routineStepFor, setDownRoutine, type DueRoutine } from '@/services/routine-run';
import { routineWorldFor } from '@/services/routine-world';
import { advanceClockBySim, flushSimClock, ensureDefaultTimescale } from '@/services/time';
import { spanInWords, hourInWords } from '@/services/table-clock';
import { cycleToLocalDate, secondsToCycles, type CalendarSpec } from '@/types/time';
import { createCampaignEvent } from '@/services/campaign-event';
import { broadcastEvent } from '@/lib/campaign-stream';
import type { TerminalEvent, TerminalPayload } from '@/types/terminal';

// ── Shape ────────────────────────────────────────────────────────────────────

export interface StretchActor { userId: string; username: string; role: string }

export interface StretchInput {
  seconds: number;
  /** What the Watcher (or JEWL) said of the span — reaches every being once, at the start. */
  narration?: string;
  source: 'table' | 'jewl' | 'script';
  directives?: StretchDirective[];
}

export type LivedStatus = 'ok' | 'not_crystallized' | 'disabled' | 'error';

export interface LivedBeing {
  characterId: string;
  name: string;
  status: LivedStatus;
  days: DayRecord[];
  /** One line for the table, per being (what the old time-skip posted). */
  line: string;
  detail?: string;
}

export interface StretchReport {
  span: string;
  seconds: number;
  from: number;
  to: number;
  grain: Grain;
  windows: number;
  localDate: string;
  lived: LivedBeing[];
  /** What the world refused across the span, deduplicated — what the map lacks (JEWL reads this). */
  refused: string[];
}

/** Under this a stated span is a pause in the scene, not a stretch to live through. */
export const STRETCH_MIN_SECONDS = 60 * 60;
/** Rounds of stepping per window before the beings are set down for the hour. */
const MAX_ROUNDS_PER_WINDOW = 10;
/** A knock or a wait repeated this many rounds with nothing changing: nobody is coming. */
const WAIT_ROUNDS = 3;
/** Lines two beings within reach may exchange in one window (Michael 2026-10-31: "capped at 4"). */
const EXCHANGE_CAP = 4;

// ── One stretch at a time per campaign ───────────────────────────────────────

const inFlight: Map<string, Promise<unknown>> =
  ((globalThis as unknown as { __stretchInFlight?: Map<string, Promise<unknown>> }).__stretchInFlight ??= new Map());

export function stretchInProgress(campaignId: string): boolean { return inFlight.has(campaignId); }

export async function liveStretch(campaignId: string, actor: StretchActor, input: StretchInput): Promise<StretchReport> {
  const prev = inFlight.get(campaignId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(() => liveStretchNow(campaignId, actor, input));
  inFlight.set(campaignId, run);
  try { return await run; } finally { if (inFlight.get(campaignId) === run) inFlight.delete(campaignId); }
}

// ── The walk ─────────────────────────────────────────────────────────────────

interface Being {
  id: string;
  name: string;
  sex: string | null;
  entityDaId: string;
  sheet: Record<string, unknown> | null;
  routines: RoutineForStretch[];
  days: Map<number, DayRecord>;
  /** The listen this window (its thought, impulse, resistance). */
  listen: ListenResult | null;
  running: DueRoutine | null;
  queued: string[];
  /** Knocks/waits this window: door or thing → rounds. */
  waits: Map<string, number>;
  stepsThisWindow: number;
  accountedDay: number;
  spokeWith: Set<string>;
}

type Timescale = { unitsPerMetaCycle: number; calendar: CalendarSpec | null; unitName: string };

async function liveStretchNow(campaignId: string, actor: StretchActor, input: StretchInput): Promise<StretchReport> {
  const ts = (await ensureDefaultTimescale(campaignId)) as Timescale;
  const start = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  const seconds = Math.max(0, input.seconds);
  const end = start + secondsToCycles(seconds, ts);
  const span = spanInWords(seconds);
  const grain = grainFor(seconds);
  const windows = windowsFor(start, end, grain);
  const totalDays = windows.length ? windows[windows.length - 1].dayIndex + 1 : 0;
  const by = await gmOf(campaignId, actor);
  const report: StretchReport = { span, seconds, from: start, to: end, grain, windows: windows.length, localDate: '', lived: [], refused: [] };

  if (!isDayaEnabled() || seconds < STRETCH_MIN_SECONDS || !windows.length) {
    // A pause, or no beings to live it: the clock moves, that is all.
    if (seconds > 0) await advanceClockBySim(campaignId, seconds, `stretch:${input.source}`);
    await flushSimClock(campaignId).catch(() => null);
    report.localDate = await localDateNow(campaignId, ts);
    if (!isDayaEnabled()) report.lived = (await roster(campaignId)).crystallized.map((c) => ({ characterId: c.id, name: c.name, status: 'disabled' as const, days: [], line: `${c.name}, over ${span}: not lived (DAYA is off)` }));
    return report;
  }

  console.log(`[stretch] ${span} (${grain} grain, ${windows.length} windows) from cycle ${start.toFixed(5)} — source ${input.source}${input.narration ? ` — "${input.narration.slice(0, 80)}"` : ''}`);

  // Who lives it: every crystallized character (Michael 2026-10-31: "every entity that is live in the campaign").
  const { crystallized, others } = await roster(campaignId);
  const beings: Being[] = [];
  for (const c of crystallized) {
    try {
      const entityDaId = await resolveDayaEntityId(c.id);
      beings.push({ id: c.id, name: c.name, sex: sexOf(c.data), entityDaId, sheet: sheetOf(c.data), routines: await routinesOf(entityDaId), days: new Map(), listen: null, running: null, queued: [], waits: new Map(), stepsThisWindow: 0, accountedDay: -1, spokeWith: new Set() });
    } catch (err) {
      report.lived.push({ characterId: c.id, name: c.name, status: 'error', days: [], line: `${c.name}, over ${span}: not lived (${msg(err)})`, detail: msg(err) });
    }
  }
  for (const o of others) report.lived.push({ characterId: o.id, name: o.name, status: 'not_crystallized', days: [], line: `${o.name}, over ${span}: not yet crystallized (${o.status}) — nothing lived` });

  // Directives: what a Trailblazer says their character does; what the Watcher overrides. Intentions for the span.
  for (const d of input.directives ?? []) {
    const b = beings.find((x) => x.id === d.character || x.name.toLowerCase() === d.character.trim().toLowerCase() || x.name.toLowerCase().startsWith(d.character.trim().toLowerCase()));
    if (!b) { report.refused.push(`directive for "${d.character}": no crystallized character by that name`); continue; }
    try {
      await setIntention(b.id, { description: d.text.trim(), dueCycle: start, dueUntil: end, authority: d.authority }, start);
      console.log(`[stretch] ${b.name}: ${d.authority} directive — "${d.text.trim().slice(0, 100)}"`);
    } catch (err) { report.refused.push(`directive for ${b.name}: ${msg(err)}`); }
  }

  const facts = await factLines(campaignId);
  const dueByWindow = new Map<string, number[]>();
  for (const b of beings) dueByWindow.set(b.id, windows.map((w) => routinesDueIn(w, b.routines).length));

  // Walk.
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    await moveClockTo(campaignId, w.start, ts, input.source);
    const local = cycleToLocalDate(w.start, ts);
    const hour = hourInWords(local.hour ?? 12);
    const label = windowLabel(w, totalDays);
    console.log(`[stretch] ── ${label} (${local.formatted}) ──`);
    for (const b of beings) { b.listen = null; b.waits.clear(); b.stepsThisWindow = 0; b.spokeWith.clear(); }

    if (w.sleep) {
      await liveNight(campaignId, by, beings, w, hour, facts, report);
      continue;
    }

    // What the hour calls up, per being.
    for (const b of beings) {
      for (const r of routinesDueIn(w, b.routines)) {
        if (b.running) { b.queued.push(r.id); continue; }
        const due = await callUpRoutine(campaignId, b.id, r.id, { sex: b.sex });
        if (!due) { markRoutineDone(b, w, r.name); continue; }
        if (!(await hourMayRun(b, w, due))) continue;
        b.running = due;
      }
    }

    // The hour itself reaches every being once (the first window carries the Watcher's framing of the span).
    const framing = i === 0 && input.narration?.trim() ? ` ${input.narration.trim()}` : '';
    for (const b of beings) {
      const due = await dueIntentionsFor(b.entityDaId, '', w.start);
      const meant = intentionLine(due.filter((d) => d.authority !== 'gm'));
      const content = `It is ${hour}.${framing}${b.running ? '' : meant ? ` ${meant}` : ''}`;
      b.listen = await listenSafe(b, { content, routine: b.running ? { step: b.running.step.step, because: b.running.step.because } : undefined });
    }

    // The beings share one world: one step each, round and round, until nobody moves.
    await stepRoundRobin(campaignId, by, beings, w, hour, facts, report);

    // The account of the day — the being's own listen and answer, framed with the day's facts.
    for (const b of beings) {
      const idx = accountWindowIndex(windows, w.dayIndex, dueByWindow.get(b.id) ?? []);
      if (idx !== i || b.accountedDay === w.dayIndex) continue;
      b.accountedDay = w.dayIndex;
      await giveAccount(campaignId, by, b, w, hour, totalDays, report);
    }
  }

  // The end: the clock lands; one history line; what was left running is set down.
  await moveClockTo(campaignId, end, ts, input.source);
  await flushSimClock(campaignId).catch(() => null);
  report.localDate = await localDateNow(campaignId, ts);
  for (const b of beings) {
    if (b.running) { await setDownRoutine(b.running.id, 'the stretch ended'); b.running = null; }
    const days = [...b.days.values()].sort((a, c) => a.dayIndex - c.dayIndex);
    report.lived.push({ characterId: b.id, name: b.name, status: 'ok', days, line: lineFor(b.name, span, days) });
    for (const d of days) for (const r of d.refused) if (!report.refused.includes(r)) report.refused.push(r);
    await postDays(campaignId, by, b, days, totalDays).catch((err) => console.warn('[stretch] post failed (non-fatal):', msg(err)));
  }
  console.log(`[stretch] ${span} lived by ${beings.length} being(s): ${beings.map((b) => b.name).join(', ')} → ${report.localDate}`);
  return report;
}

// ── Night ────────────────────────────────────────────────────────────────────

async function liveNight(campaignId: string, by: Gm, beings: Being[], w: StretchWindow, hour: string, facts: FactLine[], report: StretchReport): Promise<void> {
  for (const b of beings) {
    for (const r of routinesDueIn(w, b.routines)) {
      if (b.running) break;
      const due = await callUpRoutine(campaignId, b.id, r.id, { sex: b.sex });
      if (due) { b.running = due; b.listen = await listenSafe(b, { content: `It is ${hour}.`, routine: { step: due.step.step, because: due.step.because } }); }
    }
  }
  if (beings.some((b) => b.running)) await stepRoundRobin(campaignId, by, beings, w, hour, facts, report);
  for (const b of beings) {
    if (b.running) { await setDownRoutine(b.running.id, 'night fell'); b.running = null; }
    const rec = dayRec(b, w);
    try {
      await runDreamConsolidation(b.id);
      rec.dreamed = true;
      console.log(`[stretch] ${b.name}: slept and dreamed`);
    } catch (err) { console.warn(`[stretch] ${b.name}: no dream (non-fatal): ${msg(err)}`); rec.dreamed = true; }
  }
}

// ── Stepping ─────────────────────────────────────────────────────────────────

async function stepRoundRobin(campaignId: string, by: Gm, beings: Being[], w: StretchWindow, hour: string, facts: FactLine[], report: StretchReport): Promise<void> {
  for (let round = 0; round < MAX_ROUNDS_PER_WINDOW; round++) {
    let progressed = false;
    for (const b of beings) {
      if (!b.running) continue;
      const rec = dayRec(b, w);
      const routine = b.running;
      const eff = routine.step.effect;
      const key = eff.op === 'sound' ? `knock:${eff.at}` : eff.op === 'wait' ? `wait:${eff.for}` : null;
      if (key) {
        const n = (b.waits.get(key) ?? 0) + 1;
        b.waits.set(key, n);
        if (n > WAIT_ROUNDS) {
          const why = eff.op === 'sound' ? `nobody came to ${eff.at}` : eff.op === 'wait' ? `${eff.for} never came` : 'nothing changed';
          rec.held = [...(rec.held ?? []), `${routine.name}: set down — ${why}`];
          await setDownRoutine(routine.id, why);
          b.running = await nextQueued(campaignId, b);
          continue;
        }
        if (n > 1) { continue; } // knocked already / still waiting: let the others move
      }
      if (b.stepsThisWindow >= 12) { await setDownRoutine(routine.id, 'too many steps this hour'); b.running = await nextQueued(campaignId, b); continue; }
      b.stepsThisWindow++;
      const listen = b.listen;
      const result = await runRoutineStep({
        campaignId, by, being: { id: b.id, name: b.name, sex: b.sex, entityDaId: b.entityDaId, sheet: b.sheet as never },
        routine, listen: { thought: listen?.thought ?? '', impulse: listen?.impulse ?? 'act', stayReason: listen?.stayReason ?? null, resistance: listen?.resistance ?? null },
        heard: `It is ${hour}.`, facts, addressed: false,
      }).catch((err) => { console.warn(`[stretch] ${b.name}: step failed (non-fatal): ${msg(err)}`); return null; });
      if (!result) { await setDownRoutine(routine.id, 'the step failed'); b.running = await nextQueued(campaignId, b); continue; }
      if (result.status === 'broke') {
        rec.held = [...(rec.held ?? []), `${routine.name}: broke off — ${result.reason}`];
        await setDownRoutine(routine.id, `broke off: ${result.reason}`);
        b.running = await nextQueued(campaignId, b);
        continue;
      }
      if (result.status === 'held') {
        rec.held = [...(rec.held ?? []), `${routine.name}: held — ${result.reason}`];
        // A hold stands for the round; three holds and the routine is set down (the fear held, or the roll is in a player's hands).
        const n = (b.waits.get(`hold:${routine.id}`) ?? 0) + 1; b.waits.set(`hold:${routine.id}`, n);
        if (n >= WAIT_ROUNDS) { await setDownRoutine(routine.id, result.reason); b.running = await nextQueued(campaignId, b); }
        continue;
      }
      // Followed.
      if (result.effect.op !== 'wait') {
        rec.acts.push(result.act);
        for (const r of result.refused) rec.refused.push(`${b.name}: ${r}`);
        if (result.applied.length) progressed = true;
        await settleByAct(campaignId, b, result.act, rec);
      }
      // The world answers the act: a sound reaches whoever is there and may call up THEIR routine.
      for (const snd of result.sounds ?? []) {
        for (const o of beings) {
          if (o.id === b.id || !(await hears(campaignId, o, snd))) continue;
          console.log(`[stretch] ${o.name} hears: ${snd.text}`);
          o.listen = await listenSafe(o, { content: snd.text, via: ['hearing'] });
          if (!o.running) {
            const due = await routineStepFor(campaignId, o.id, snd.text, { sex: o.sex });
            if (due) { o.running = due; progressed = true; }
          }
        }
      }
      if (result.done) { markRoutineDone(b, w, routine.name); b.running = await nextQueued(campaignId, b); }
      else {
        const next = await replanRoutine(campaignId, b.id, routine.id, { sex: b.sex });
        if (next) { b.running = next; if (next.step.act !== routine.step.act) progressed = true; }
        else { markRoutineDone(b, w, routine.name); b.running = await nextQueued(campaignId, b); }
      }
      // Within reach of someone this round: a few words (Michael 2026-10-31: capped at 4 lines).
      await maybeSpeak(campaignId, beings, b, w, report);
    }
    if (!progressed && !beings.some((b) => b.running && (b.waits.size === 0))) break;
    if (!progressed && round >= WAIT_ROUNDS) break;
  }
}

async function nextQueued(campaignId: string, b: Being): Promise<DueRoutine | null> {
  while (b.queued.length) {
    const id = b.queued.shift()!;
    const due = await callUpRoutine(campaignId, b.id, id, { sex: b.sex });
    if (due) return due;
  }
  return null;
}

/**
 * The hour called a routine up: it may run only if its things are not in someone else's hands (his pizza run when the
 * only pizza is the one he delivered to her). Otherwise it is set down and the lack goes on the record for JEWL.
 */
async function hourMayRun(b: Being, w: StretchWindow, due: DueRoutine): Promise<boolean> {
  const needs = endsNeedingAnothersHands(due.ends, due.world.things, b.id, pickByName);
  if (!needs.length) return true;
  const rec = dayRec(b, w);
  for (const n of needs) rec.refused.push(`${b.name}'s "${due.name}" needs ${n.item}, but the only one is in ${n.holder}'s hands — the world has no fresh one (stock the place it comes from)`);
  await setDownRoutine(due.id, `needs ${needs.map((n) => n.item).join(', ')} that only ${needs.map((n) => n.holder).join('/')} holds`);
  return false;
}

function markRoutineDone(b: Being, w: StretchWindow, name: string): void {
  const rec = dayRec(b, w);
  if (!rec.routinesDone.includes(name)) rec.routinesDone.push(name);
}

/** Does this being hear a sound: its room is one the sound names (both sides of a door), or the sound's own room. */
async function hears(campaignId: string, o: Being, snd: { locationId: string | null; rooms?: string[] }): Promise<boolean> {
  const world = await routineWorldFor(campaignId, o.id, { sex: o.sex });
  const room = world?.actor.roomName?.toLowerCase() ?? null;
  if (!room) return false;
  if (snd.rooms?.some((r) => r.toLowerCase() === room)) return true;
  if (snd.locationId && world?.actor.roomId === snd.locationId) return true;
  return false;
}

// ── Speech ───────────────────────────────────────────────────────────────────

async function maybeSpeak(campaignId: string, beings: Being[], a: Being, w: StretchWindow, report: StretchReport): Promise<void> {
  const world = await routineWorldFor(campaignId, a.id, { sex: a.sex });
  if (!world) return;
  for (const p of world.people) {
    if (p.reach !== 'here' && p.reach !== 'through-open') continue;
    const o = beings.find((x) => x.id === p.id);
    if (!o || a.spokeWith.has(o.id)) continue;
    if (a.listen?.impulse !== 'speak' && o.listen?.impulse !== 'speak') continue;
    a.spokeWith.add(o.id); o.spokeWith.add(a.id);
    let speaker = a.listen?.impulse === 'speak' ? a : o;
    let hearer = speaker === a ? o : a;
    let ask: Parameters<typeof answerAsk>[1] = { kind: 'turn' };
    for (let n = 0; n < EXCHANGE_CAP; n++) {
      let res: Awaited<ReturnType<typeof answerAsk>>;
      try { res = await answerAsk(speaker.id, ask); } catch (err) { console.warn(`[stretch] ${speaker.name} could not answer (non-fatal): ${msg(err)}`); break; }
      const after = await res.after;
      if (res.action.kind === 'speak' && res.action.content) {
        const line = `${speaker.name}: ${res.action.content.trim()}`;
        dayRec(speaker, w).said.push(line);
        console.log(`[stretch] ${line}`);
        hearer.listen = await listenSafe(hearer, { content: line, source: 'dialogue' });
        ask = { kind: 'spoken', by: speaker.name, text: res.action.content.trim() };
        [speaker, hearer] = [hearer, speaker];
        continue;
      }
      if (res.action.kind === 'act' && res.action.content) {
        const rec = dayRec(speaker, w);
        rec.acts.push(after.outcome ?? res.action.content);
        for (const c of after.worldChanges ?? []) if (/refused/i.test(c)) rec.refused.push(`${speaker.name}: ${c}`);
        await settleByAct(campaignId, speaker, after.outcome ?? res.action.content, rec);
      }
      break; // nothing said: the exchange ends
    }
  }
  void report;
}

// ── The account ──────────────────────────────────────────────────────────────

async function giveAccount(campaignId: string, by: Gm, b: Being, w: StretchWindow, hour: string, totalDays: number, report: StretchReport): Promise<void> {
  const rec = dayRec(b, w);
  const now = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? w.start;
  const due = await dueIntentionsFor(b.entityDaId, '', now);
  const overrides = due.filter((d) => d.authority === 'gm');
  const own = due.filter((d) => d.authority !== 'gm');

  // The Watcher's overrides HAPPEN as written: narrated through the adjudicator (effects only, no roll), remembered as lived.
  for (const o of overrides) {
    try {
      const r = await resolveIntent({ campaignId, entityCharacterId: b.id, intent: o.description, cycle: now, narrated: true });
      await wake({ kind: 'adjudication_result', entityId: b.id, payload: r as unknown as Record<string, unknown> });
      rec.acts.push(o.description.replace(/[.!?]+$/, ''));
      for (const x of r.effects?.refused ?? []) rec.refused.push(`${b.name}: ${x}`);
      await settleIntention(o.id, 'DONE');
      rec.intentionsDone.push(o.description);
      console.log(`[stretch] ${b.name}: the Watcher's word — "${o.description.slice(0, 80)}" (${r.effects?.applied.join('; ') || 'nothing moved'})`);
    } catch (err) { rec.refused.push(`${b.name}: override failed — ${msg(err)}`); }
  }

  // The being's own account: the day so far put to it as what it knows, then the turn is its own.
  const today = actsInProse(b.name, rec.acts);
  const meant = intentionLine(own);
  const dayLine = totalDays > 1 ? ` Day ${w.dayIndex + 1} of ${totalDays}.` : '';
  const content = [`It is ${hour}.${dayLine}`, today ? `So far today: ${today}` : 'Nothing has happened yet today.', meant ?? ''].filter(Boolean).join(' ');
  b.listen = await listenSafe(b, { content });
  if (b.listen?.thought) rec.account = b.listen.thought.trim();
  let res: Awaited<ReturnType<typeof answerAsk>> | null = null;
  try { res = await answerAsk(b.id, { kind: 'turn' }); } catch (err) { console.warn(`[stretch] ${b.name}: no answer for the day (non-fatal): ${msg(err)}`); }
  if (res) {
    const after = await res.after;
    if (res.action.kind === 'act' && res.action.content) {
      const did = after.outcome ?? res.action.content;
      rec.acts.push(did);
      rec.outcome = after.outcome;
      for (const c of after.worldChanges ?? []) if (/refused/i.test(c)) rec.refused.push(`${b.name}: ${c}`);
      await settleByAct(campaignId, b, did, rec);
      console.log(`[stretch] ${b.name}'s day: ${did.slice(0, 120)}`);
    } else if (res.action.kind === 'speak' && res.action.content) {
      rec.said.push(`${b.name}: ${res.action.content.trim()}`);
    }
  }
  void by; void report;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

type Gm = { userId: string; username: string };

async function gmOf(campaignId: string, actor: StretchActor): Promise<Gm> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } }).catch(() => null);
  if (!c?.gmUserId) return { userId: actor.userId, username: actor.username };
  const u = await prisma.user.findUnique({ where: { id: c.gmUserId }, select: { username: true } }).catch(() => null);
  return { userId: c.gmUserId, username: u?.username ?? actor.username };
}

async function roster(campaignId: string): Promise<{ crystallized: Array<{ id: string; name: string; data: string }>; others: Array<{ id: string; name: string; status: string }> }> {
  const rows = await prisma.character.findMany({
    where: { campaignId, entityType: { in: ['NPC', 'PLAYER_CHARACTER'] }, status: { notIn: ['DEAD', 'RETIRED'] } },
    select: { id: true, name: true, status: true, data: true },
    orderBy: { name: 'asc' },
  });
  const crystallized = rows.filter((r) => r.status === 'ACTIVE' || r.status === 'APPROVED');
  const others = rows.filter((r) => !crystallized.includes(r)).map((r) => ({ id: r.id, name: r.name, status: r.status }));
  return { crystallized, others };
}

async function routinesOf(entityDaId: string): Promise<RoutineForStretch[]> {
  const rows = await prisma.dayaRoutine.findMany({ where: { entityId: entityDaId, status: { in: ['READY', 'RUNNING', 'DONE'] } }, orderBy: { createdAt: 'asc' } });
  const ids = [...new Set(rows.flatMap((r) => { try { return JSON.parse(r.sourceIntentionIds) as string[]; } catch { return []; } }))];
  const intentions = ids.length ? await prisma.dayaIntention.findMany({ where: { id: { in: ids } }, select: { id: true, description: true } }) : [];
  const desc = new Map(intentions.map((i) => [i.id, i.description]));
  return rows.map((r) => {
    let src: string[] = []; try { src = JSON.parse(r.sourceIntentionIds) as string[]; } catch { src = []; }
    return { id: r.id, name: r.name, cadence: r.cadence as RoutineForStretch['cadence'], status: r.status, lastDoneCycle: r.lastDoneCycle, sourceDescriptions: src.map((id) => desc.get(id)).filter((x): x is string => !!x) };
  });
}

async function factLines(campaignId: string): Promise<FactLine[]> {
  try { return (await currentFacts(campaignId)).map((f) => ({ subjectKey: f.subjectKey, fact: f.fact })); } catch { return []; }
}

async function moveClockTo(campaignId: string, cycle: number, ts: Timescale, source: string): Promise<void> {
  const now = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  const seconds = ((cycle - now) / secondsToCycles(1, ts));
  if (seconds >= 1) await advanceClockBySim(campaignId, seconds, `stretch:${source}`);
}

async function localDateNow(campaignId: string, ts: Timescale): Promise<string> {
  const now = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  return cycleToLocalDate(now, ts).formatted;
}

async function listenSafe(b: Being, s: { content: string; source?: 'perception' | 'dialogue'; via?: string[]; routine?: { step: string; because: string[] } }): Promise<ListenResult | null> {
  try {
    return await listenAtTable(b.id, { source: s.source ?? 'perception', content: s.content, ...(s.via ? { via: s.via } : {}), ...(s.routine ? { routine: s.routine } : {}) });
  } catch (err) {
    console.warn(`[stretch] ${b.name} could not listen (non-fatal): ${msg(err)}`);
    return null;
  }
}

async function settleByAct(campaignId: string, b: Being, act: string, rec: DayRecord): Promise<void> {
  const settled = await settleIntentionsByAct(b.id, act, (pending, a) => judgeIntentionsDone(campaignId, pending, a));
  for (const s of settled) if (!rec.intentionsDone.includes(s.description)) rec.intentionsDone.push(s.description);
}

function dayRec(b: Being, w: StretchWindow): DayRecord {
  let rec = b.days.get(w.dayIndex);
  if (!rec) { rec = { dayIndex: w.dayIndex, calendarDay: w.calendarDay, acts: [], said: [], intentionsDone: [], routinesDone: [], refused: [] }; b.days.set(w.dayIndex, rec); }
  return rec;
}

function lineFor(name: string, span: string, days: DayRecord[]): string {
  const acts = days.reduce((n, d) => n + d.acts.length, 0);
  const said = days.reduce((n, d) => n + d.said.length, 0);
  const done = days.flatMap((d) => d.routinesDone);
  const bits = [acts ? `${acts} act${acts === 1 ? '' : 's'}` : '', said ? `${said} line${said === 1 ? '' : 's'} said` : '', done.length ? `routines: ${[...new Set(done)].join(', ')}` : ''].filter(Boolean);
  return `${name}, over ${span}: ${bits.length ? bits.join('; ') : 'nothing of note'}`;
}

function sexOf(data: string): string | null {
  try { const d = JSON.parse(data) as { identity?: { sex?: string; physicalDescription?: { gender?: string } } }; return d.identity?.sex || d.identity?.physicalDescription?.gender || null; } catch { return null; }
}
function sheetOf(data: string): Record<string, unknown> | null {
  try { return JSON.parse(data) as Record<string, unknown>; } catch { return null; }
}
function msg(err: unknown): string { return err instanceof Error ? err.message : String(err); }

// ── The record ───────────────────────────────────────────────────────────────

async function postDays(campaignId: string, by: Gm, b: Being, days: DayRecord[], totalDays: number): Promise<void> {
  const cycle = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }).catch(() => null))?.currentCycle;
  for (const d of days) {
    const text = `${totalDays > 1 ? `Day ${d.dayIndex + 1}: ` : ''}${dayParagraph(b.name, d)}`;
    const payload: TerminalPayload = { kind: 'game_event', eventType: 'timeskip', description: text, ...(cycle !== undefined ? { cycle } : {}) };
    const event = await createCampaignEvent({
      campaignId, type: 'game_event', actor: 'system', actorUserId: by.userId, actorName: by.username,
      characterId: b.id, characterName: b.name, payload,
    });
    const terminalEvent: TerminalEvent = {
      id: `ev-${event.id}`, type: 'game_event',
      timestamp: event.createdAt instanceof Date ? event.createdAt.toISOString() : String(event.createdAt),
      campaignId, actor: 'system', actorUserId: by.userId, actorName: by.username,
      characterId: b.id, characterName: b.name, sessionId: event.sessionId || undefined, payload,
    };
    broadcastEvent(campaignId, { kind: 'terminal_event', event: terminalEvent });
  }
}
