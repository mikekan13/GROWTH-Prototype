/**
 * ORDINARY COMPETENCE at the table (Claude; ruled by Michael 2026-10-30).
 *
 * Before a being listens: is a routine of its called up by what reached it (a
 * trigger in the cue), or already running? If so, the next step is planned from
 * the live world and handed to the listen as a fact about itself.
 *
 * After it has listened: the PLAYER behind it decides — follow, hold, break.
 * Follow: if a survival-rung memory rose against the step, the dice decide
 * (a fear check on Willpower, the same roll a Trailblazer would make, carded on
 * the record); then the step runs through world-apply like any act. Hold: the
 * reason goes on the record for the Watcher, and a reason the facts refute is a
 * guess — the step runs anyway. Break: the being answers freely instead.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import type { ActEffect } from '@/services/world-apply';
import { applyActEffects } from '@/services/world-apply';
import { routineWorldFor } from '@/services/routine-world';
import { nextStep, routineDone, advanceCursor, triggerInCue, endsInWordsFrom, parseEnds, ROUTINE_LAPSE_CYCLES, ROUTINE_STEP_CAP, type RoutineEnd, type RoutineStep, type RoutineWorld } from '@/daya/routines';
import { playerDecides } from '@/daya/player';
import { claimVsFact, type FactLine } from '@/daya/claim-vs-fact';
import { startTableRoll, rollOutcome } from '@/services/table-roll';
import { DAY_CYCLES } from '@/daya/intentions';
import type { GrowthCharacter } from '@/types/growth';

export interface DueRoutine {
  id: string;
  name: string;
  ends: RoutineEnd[];
  /** Where the instance stands in its ends (never goes back). */
  cursor: number;
  step: RoutineStep;
  world: RoutineWorld;
  /** Why it is due: the trigger word in the cue, or the routine was already running. */
  why: 'trigger' | 'running';
  /** For the listening prompt and the player. */
  endsInWords: string[];
}

const RE_ARM_AFTER: Record<string, number> = { daily: 0.5 * DAY_CYCLES, nightly: 0.5 * DAY_CYCLES, weekly: 3 * DAY_CYCLES, always: 0 };

let deriving = new Set<string>();

/**
 * The routine step due for a being on this cue, or null. Marks a triggered routine RUNNING; sets a finished one DONE
 * (and re-arms it by its cadence); lapses one that ran too long. Never throws. When a being has intentions but no
 * routines yet, derivation is kicked off in the background and this beat passes.
 */
export async function routineStepFor(campaignId: string, characterId: string, cue: string, opts: { sex?: string | null } = {}): Promise<DueRoutine | null> {
  try {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
    if (!entity) return null;
    const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } });
    const now = camp?.currentCycle ?? 0;
    const rows = await prisma.dayaRoutine.findMany({ where: { entityId: entity.id, status: { in: ['READY', 'RUNNING', 'DONE'] } }, orderBy: { createdAt: 'asc' } });
    if (!rows.length) {
      void maybeDerive(characterId, entity.id);
      return null;
    }
    // Re-arm by cadence; lapse a run that went on too long.
    for (const r of rows) {
      if (r.status === 'DONE' && r.cadence && r.lastDoneCycle !== null && now - r.lastDoneCycle >= (RE_ARM_AFTER[r.cadence] ?? 0)) {
        await prisma.dayaRoutine.update({ where: { id: r.id }, data: { status: 'READY', cursor: 0, steps: 0 } });
        r.status = 'READY'; r.cursor = 0; r.steps = 0;
      }
      if (r.status === 'RUNNING' && ((r.startedCycle !== null && now - r.startedCycle > ROUTINE_LAPSE_CYCLES) || r.steps >= ROUTINE_STEP_CAP)) {
        await prisma.dayaRoutine.update({ where: { id: r.id }, data: { status: r.cadence ? 'READY' : 'RETIRED', cursor: 0, steps: 0 } });
        r.status = r.cadence ? 'READY' : 'RETIRED';
        console.log(`[routine] ${r.name}: lapsed unfinished (${r.steps} steps)`);
      }
    }
    const running = rows.find((r) => r.status === 'RUNNING');
    const triggered = running ? null : rows.map((r) => ({ r, t: triggerInCue(parseList(r.triggers), cue) })).find((x) => x.r.status === 'READY' && x.t);
    const chosen = running ?? triggered?.r ?? null;
    if (!chosen) return null;
    const ends = parseEnds(safeJson(chosen.ends));
    if (!ends.length) return null;
    const world = await routineWorldFor(campaignId, characterId, { sex: opts.sex });
    if (!world) return null;
    const cursor = advanceCursor(ends, world, chosen.status === 'RUNNING' ? chosen.cursor : 0);
    if (cursor !== chosen.cursor) await prisma.dayaRoutine.update({ where: { id: chosen.id }, data: { cursor } }).catch(() => undefined);
    if (routineDone(ends, world, cursor)) {
      await prisma.dayaRoutine.update({ where: { id: chosen.id }, data: { status: 'DONE', lastDoneCycle: now, cursor: 0, steps: 0 } });
      console.log(`[routine] ${world.actor.name}: "${chosen.name}" is done`);
      return null;
    }
    const step = nextStep(ends, world, cursor);
    if (!step) return null;
    if (chosen.status !== 'RUNNING') {
      await prisma.dayaRoutine.update({ where: { id: chosen.id }, data: { status: 'RUNNING', startedCycle: now, cursor, steps: 0 } });
      console.log(`[routine] ${world.actor.name}: "${chosen.name}" called up by "${triggered?.t}"`);
    }
    return { id: chosen.id, name: chosen.name, ends, cursor, step, world, why: running ? 'running' : 'trigger', endsInWords: endsInWordsFrom(ends, world, cursor) };
  } catch (err) {
    console.warn('[routine] step lookup failed (non-fatal):', err instanceof Error ? err.message : err);
    return null;
  }
}

async function maybeDerive(characterId: string, entityId: string): Promise<void> {
  if (deriving.has(entityId)) return;
  const any = await prisma.dayaIntention.count({ where: { entityId, status: 'PENDING', OR: [{ cadence: { not: null } }, { trigger: { not: null } }] } }).catch(() => 0);
  if (!any) return;
  deriving.add(entityId);
  setImmediate(() => {
    import('@/services/routine-derive')
      .then((m) => m.deriveRoutines(characterId))
      .then((made) => console.log(`[routine] derived ${made.length} routine(s) for ${characterId} in the background`))
      .catch((err) => console.warn('[routine] background derivation failed (non-fatal):', err instanceof Error ? err.message : err))
      .finally(() => { deriving.delete(entityId); });
  });
}

// ── Running the step ─────────────────────────────────────────────────────────

export interface RoutineRunInput {
  campaignId: string;
  /** Who writes the record (the Watcher at the table). */
  by: { userId: string; username: string };
  being: { id: string; name: string; sex?: string | null; entityDaId: string; sheet: Partial<GrowthCharacter> | null };
  routine: DueRoutine;
  listen: { thought: string; impulse: 'speak' | 'act' | 'stay'; stayReason?: string | null; resistance: { content: string; arousal: number } | null };
  heard: string;
  sinceOwn?: string | null;
  /** Someone is speaking to the being this beat (the player weighs it before a step that ends the exchange). */
  addressed?: boolean;
  /** The world's facts this beat, for checking a hold's reason. */
  facts: FactLine[];
}

export type RoutineRunResult =
  | { status: 'followed'; act: string; effect: RoutineStep['effect']; applied: string[]; refused: string[]; roll?: RollNote; player: { reason: string; ms: number }; done: boolean }
  | { status: 'held'; reason: string; checked: 'stands' | 'refuted'; roll?: RollNote; player: { reason: string; ms: number } }
  | { status: 'broke'; reason: string; player: { reason: string; ms: number } };

export interface RollNote { rollId: string; success: boolean | null; total?: number; dr: number; via: 'ai' | 'popup' }

/** Provisional (NEEDS MIKE — the DR ladder): a fear check's DR from the charge of the memory that rose against the step. */
export const FEAR_DR = { base: 6, perArousal: 4, min: 6, max: 10 };
export function fearDr(arousal: number): number {
  return Math.max(FEAR_DR.min, Math.min(FEAR_DR.max, FEAR_DR.base + Math.round(FEAR_DR.perArousal * Math.max(0, Math.min(1, arousal)))));
}

export async function runRoutineStep(input: RoutineRunInput): Promise<RoutineRunResult> {
  const { campaignId, being, routine } = input;
  const player = await playerDecides({
    entityDaId: being.entityDaId, campaignId, name: being.name, sheet: being.sheet,
    routine: { name: routine.name, step: routine.step.step, because: routine.step.because, ends: routine.endsInWords },
    thought: input.listen.thought, impulse: input.listen.impulse, stayReason: input.listen.stayReason, resistance: input.listen.resistance,
    heard: input.heard, sinceOwn: input.sinceOwn, addressed: input.addressed ?? false,
  });
  console.log(`[player] ${being.name}: ${player.decision}${player.reason ? ` — ${player.reason}` : ''} (${player.ms} ms)${player.raw ? ` raw="${player.raw}"` : ''}`);
  const note = { reason: player.reason, ms: player.ms };

  if (player.decision === 'break') return { status: 'broke', reason: player.reason, player: note };

  if (player.decision === 'hold') {
    // INACTION IS A CLAIM: a hold's reason is read against the facts like any line; refuted → a guess → the step runs.
    const contra = player.reason ? claimVsFact(player.reason, input.facts, input.heard) : null;
    if (contra) {
      console.log(`[player] ${being.name}: the hold's reason is refuted by the facts (${contra.subjectKey}: ${contra.fact}) — the step runs`);
    } else {
      return { status: 'held', reason: player.reason || 'no reason given', checked: 'stands', player: note };
    }
  }

  // FOLLOW. The dice only when something real rose against the step.
  let roll: RollNote | undefined;
  if (input.listen.resistance) {
    const dr = fearDr(input.listen.resistance.arousal);
    try {
      const gm = await gmOf(campaignId, input.by);
      const started = await startTableRoll(campaignId, gm, { characterId: being.id, text: `${being.name} ${routine.step.act} — against: ${input.listen.resistance.content.slice(0, 80)}`, fear: { governor: 'willpower', dr } });
      if (started) {
        const out = started.via === 'ai' ? await rollOutcome(campaignId, started.rollId) : null;
        roll = { rollId: started.rollId, success: out?.success ?? null, total: out?.total, dr, via: started.via };
        console.log(`[routine] ${being.name}: fear check vs DR ${dr} → ${out ? (out.success ? 'holds her nerve' : 'the fear holds her') : 'in the owner\'s hands'}`);
        if (started.via === 'popup') return { status: 'held', reason: 'the roll is in its owner\'s hands', checked: 'stands', roll, player: note };
        if (out && !out.success) return { status: 'held', reason: `the fear held: ${input.listen.resistance.content.slice(0, 100)}`, checked: 'stands', roll, player: note };
      }
    } catch (err) {
      console.warn('[routine] fear check failed; the step runs (non-fatal):', err instanceof Error ? err.message : err);
    }
  }

  const effect = routine.step.effect;
  let applied: string[] = [];
  let refused: string[] = [];
  if (effect.op !== 'wait') {
    const report = await applyActEffects(campaignId, being.id, [effect as ActEffect], routine.step.act);
    applied = report.applied; refused = report.refused;
  }
  let done = false;
  try {
    const world = await routineWorldFor(campaignId, being.id, { sex: being.sex });
    const cursor = world ? advanceCursor(routine.ends, world, routine.cursor) : routine.cursor;
    if (world && routineDone(routine.ends, world, cursor)) {
      done = true;
      const camp = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } });
      await prisma.dayaRoutine.update({ where: { id: routine.id }, data: { status: 'DONE', lastDoneCycle: camp?.currentCycle ?? 0, cursor: 0, steps: 0 } });
      console.log(`[routine] ${being.name}: "${routine.name}" is done`);
    } else {
      await prisma.dayaRoutine.update({ where: { id: routine.id }, data: { cursor, steps: { increment: 1 } } });
    }
  } catch { /* checked next beat */ }
  return { status: 'followed', act: routine.step.act, effect, applied, refused, roll, player: note, done };
}

async function gmOf(campaignId: string, by: { userId: string; username: string }): Promise<{ id: string; username: string }> {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } }).catch(() => null);
  if (!c?.gmUserId) return { id: by.userId, username: by.username };
  const u = await prisma.user.findUnique({ where: { id: c.gmUserId }, select: { username: true } }).catch(() => null);
  return { id: c.gmUserId, username: u?.username ?? by.username };
}

function parseList(raw: string | null | undefined): string[] {
  const v = safeJson(raw);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function safeJson(raw: string | null | undefined): unknown {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
