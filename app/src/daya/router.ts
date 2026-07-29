/**
 * DAYA router — persona harness routing layer. Sits in front of
 * `chat()` (model-client.ts): subsystems that speak on behalf of an entity
 * call `routeAndChat()` instead of `chat()` directly. `chat()` remains
 * callable as-is for non-entity work (adjudicator infra, JEWL) — this file
 * never modifies model-client.ts.
 *
 * Three duties, all mostly deterministic code rather than a model decision:
 *  1. Routing law — pick tier (L1/L2/C) + processing depth per request.
 *     L1 is the self; L2/C are consults whose answers fold back into
 *     L1-voiced cognition (never pass through to the entity's phenomenal
 *     stream verbatim — the fold-back itself is WP9's job).
 *  2. Clamping — attach below-ceiling authenticity constraints to
 *     entity-voiced (L1) output. See clamp.ts.
 *  3. Sanitization boundary — classify, strip, and hard-gate everything
 *     that would cross to C. See sanitize.ts.
 */
import 'server-only';
import {
  chat,
  type DayaChatMessage,
  type DayaChatResult,
  type DayaClientOverrides,
  type DayaTier,
} from './model-client';
import { generateClampConstraints, buildClampPromptText, auditClampedOutput, type ClampConstraints } from './clamp';
import { classifyTraffic, stripAndForward, assertClean } from './sanitize';

// ── Public contract ─────────────────────────────────────────────────────────

export type TaskKind = 'speech' | 'reasoning' | 'knowledge' | 'perception' | 'dream' | 'tool';
export type DifficultyClass = 'trivial' | 'standard' | 'hard' | 'extreme';
export type SkillBracket = 'low' | 'mid' | 'high';

export interface RouteRequest {
  // Forwarded verbatim to model-client's DayaChatParams.entityId, which is
  // the DayaModelCall.entityId FK -> DayaEntity.id. NEEDS-FABLE: WP3's
  // DayaTrigger.entityId convention is the Character id, which is a
  // different id space than this field — callers must resolve/upsert the
  // DayaEntity first (mirrors ensureDayaEntity in events.ts) and pass its
  // id here, not the Character id.
  entityId: string;
  subsystem: string;
  taskKind: TaskKind;
  difficulty?: number; // DR when a check exists; else the heuristic decides
  difficultyHints?: string[];
  skillCeiling: number; // governing skill level 0..20 from the True Sheet
  effort: number; // entity's motivated pool wager (Ruling 10) — router NEVER sets this
  poolState: { governing: string; current: number; max: number };
  sensitivity?: 'sensitive' | 'safe'; // caller-known override; else classifier decides
  messages: DayaChatMessage[];
  domain?: string; // clamp-tables.ts key; falls back to the generic table
  identifiers?: string[]; // known entity/character/campaign NAMES — tokenized by stripAndForward AND swept by assertClean
  rawKeys?: string[]; // opaque DB keys (campaignId, etc.) that should never appear at all — swept by assertClean only, never tokenized (there's nothing to replace them WITH)
  icOoc?: 'IC' | 'OOC';
}

export interface RoutingDecision {
  tier: DayaTier;
  consult: boolean; // true = this call is an upward consult folded back into L1 cognition
  model?: string; // within-C ladder pick, when tier === 'C'
  maxTokens: number;
  contextDepth: number; // 0..1 — fraction of normal context budget (degradation lever)
  clamp: ClampConstraints | null;
  sanitize: boolean; // MUST be true whenever tier === 'C'
  rationale: string; // written to DayaModelCall.rationale — content-free
}

export interface RouteAndChatResult extends DayaChatResult {
  decision: RoutingDecision;
}

/**
 * All numeric defaults in one place, per the design spec's ask — nothing
 * below is a magic number sprinkled through the routing logic. Every field
 * is env-overridable where the spec calls for it (DAYA_C_MODEL_TOP,
 * CLAMP_AUDIT_RATE); the rest are tunables Mike/Fable can move later
 * without touching call sites.
 */
export const ROUTER_TUNING = {
  difficulty: { standardMin: 8, hardMin: 14, extremeMin: 20 },
  skillBracket: { lowMax: 7, midMax: 15 }, // low: <8, mid: 8-15, high: 16-20
  cLadder: { haikuMin: 8, sonnetMin: 12, topMin: 20 },
  cModelHaiku: 'claude-haiku-4-6',
  cModelSonnetFallback: 'claude-sonnet-4-6', // mirrors model-client.ts's own DEFAULT_C_MODEL literal
  pool: { fullThreshold: 0.5, degradedThreshold: 0.25 },
  contextDepth: { full: 1.0, degraded: 0.6, low: 0.35, minimal: 0.2 },
  maxTokens: { base: 1024, floor: 64, halvedScale: 0.5, minimalScale: 0.25 },
  effort: { lowMax: 1 / 3, midMax: 2 / 3, multiplier: { low: 0.6, med: 1.0, high: 1.4 } },
  clampAuditRate: Number(process.env.CLAMP_AUDIT_RATE ?? 0.05),
} as const;

// ── Difficulty / skill classification ───────────────────────────────────────

function classifyDifficulty(req: Pick<RouteRequest, 'difficulty' | 'difficultyHints' | 'taskKind'>): DifficultyClass {
  if (typeof req.difficulty === 'number') {
    const d = req.difficulty;
    if (d < ROUTER_TUNING.difficulty.standardMin) return 'trivial';
    if (d < ROUTER_TUNING.difficulty.hardMin) return 'standard';
    if (d < ROUTER_TUNING.difficulty.extremeMin) return 'hard';
    return 'extreme';
  }
  if (req.taskKind === 'speech') return 'trivial';
  const hints = (req.difficultyHints ?? []).map((h) => h.toLowerCase());
  if (hints.some((h) => /extreme|impossible|god-?tier|skill-20/.test(h))) return 'extreme';
  if (hints.some((h) => /hard|difficult|dangerous|risky/.test(h))) return 'hard';
  if (hints.some((h) => /trivial|small[- ]?talk|easy/.test(h))) return 'trivial';
  return 'standard';
}

function skillBracketFor(skill: number): SkillBracket {
  if (skill <= ROUTER_TUNING.skillBracket.lowMax) return 'low';
  if (skill <= ROUTER_TUNING.skillBracket.midMax) return 'mid';
  return 'high';
}

/** Tier matrix (§1 of the spec): does this difficulty/bracket/taskKind cell
 * want a consult at all? Actual tier (L2 vs C vs fail-local-L1) is resolved
 * separately from sensitivity + pool state. */
function matrixWantsConsult(diffClass: DifficultyClass, bracket: SkillBracket, taskKind: TaskKind): boolean {
  if (diffClass === 'trivial' || diffClass === 'standard') return false; // never burn premium on the easy stuff (Ruling 8)
  if (diffClass === 'hard') {
    if (bracket === 'low') return false; // strains: felt difficulty, still L1
    if (bracket === 'mid') return taskKind === 'knowledge';
    return true; // high
  }
  // extreme
  if (bracket === 'low') return false; // fails plausibly, still L1
  return true; // mid (capped) or high (top)
}

/** 8-11 haiku-class, 12-19 sonnet-class, 20 fable/opus-class — mirrors the
 * existing skill-die ladder (lib/dice-utils.ts) rather than inventing new
 * breakpoints. Index 0 means "below the C-consult floor" (defensive only —
 * the tier matrix never sends skill <8 to a consult). */
function cLadderIndexForSkill(skill: number): number {
  if (skill >= ROUTER_TUNING.cLadder.topMin) return 3;
  if (skill >= ROUTER_TUNING.cLadder.sonnetMin) return 2;
  if (skill >= ROUTER_TUNING.cLadder.haikuMin) return 1;
  return 0;
}

/** The model name the decision records for a given ladder rung. Sonnet
 * rung intentionally reads DAYA_C_MODEL so it stays in lockstep with
 * model-client.ts's own default without this file needing to import it as
 * a literal. */
function modelForLadderIndex(idx: number): string {
  if (idx === 3) return process.env.DAYA_C_MODEL_TOP || process.env.DAYA_C_MODEL || ROUTER_TUNING.cModelSonnetFallback;
  if (idx === 2) return process.env.DAYA_C_MODEL || ROUTER_TUNING.cModelSonnetFallback;
  return ROUTER_TUNING.cModelHaiku; // idx === 1
}

// ── Pool-state degradation (Ruling 20) ──────────────────────────────────────

interface Degradation {
  contextDepth: number;
  maxTokensScale: number;
  noConsults: boolean;
  consultStepDown: boolean;
}

function poolFraction(poolState: RouteRequest['poolState']): number {
  if (poolState.max <= 0) return 0;
  return poolState.current / poolState.max;
}

function degradationForFraction(f: number): Degradation {
  const { pool, contextDepth: cd, maxTokens: mt } = ROUTER_TUNING;
  if (f >= pool.fullThreshold) return { contextDepth: cd.full, maxTokensScale: 1, noConsults: false, consultStepDown: false };
  if (f >= pool.degradedThreshold) return { contextDepth: cd.degraded, maxTokensScale: 1, noConsults: false, consultStepDown: true };
  if (f > 0) return { contextDepth: cd.low, maxTokensScale: mt.halvedScale, noConsults: true, consultStepDown: false };
  return { contextDepth: cd.minimal, maxTokensScale: mt.minimalScale, noConsults: true, consultStepDown: false }; // f<=0, felt as fog — never explained to the entity (seal)
}

function effortBandFor(effort: number, poolMax: number): 'low' | 'med' | 'high' {
  if (poolMax <= 0) return 'low';
  const frac = effort / poolMax;
  if (frac < ROUTER_TUNING.effort.lowMax) return 'low';
  if (frac < ROUTER_TUNING.effort.midMax) return 'med';
  return 'high';
}

// ── Routing law (pure, no I/O — safe to unit test directly) ───────────────

/**
 * Computes the routing decision for a request. Pure function: same input
 * always produces the same output, and req is never mutated — in
 * particular req.effort is only ever read, never adjusted (effort is the
 * entity's motivated choice, Ruling 10; it shapes depth via
 * effortBandFor, never tier).
 */
export function decideRoute(req: RouteRequest): RoutingDecision {
  const diffClass = classifyDifficulty(req);
  const bracket = skillBracketFor(req.skillCeiling);
  const wantsConsult = matrixWantsConsult(diffClass, bracket, req.taskKind);

  const sensitivity =
    req.sensitivity ??
    classifyTraffic({
      content: req.messages.map((m) => m.content).join('\n'),
      knownIdentifiers: req.identifiers,
      icOoc: req.icOoc,
    }).sensitivity;

  const f = poolFraction(req.poolState);
  const degradation = degradationForFraction(f);

  const rationale: string[] = [`diff=${diffClass}`, `bracket=${bracket}`, `pool=${f.toFixed(2)}`, `sensitivity=${sensitivity}`];

  let tier: DayaTier = 'L1';
  let consult = false;
  let model: string | undefined;
  let sanitize = false;

  if (wantsConsult && degradation.noConsults) {
    rationale.push('no-consults-pool-drained');
  } else if (wantsConsult && sensitivity === 'sensitive') {
    if (process.env.DAYA_L2_URL) {
      tier = 'L2';
      consult = true;
      rationale.push('consult-l2-sensitive');
      if (degradation.consultStepDown) rationale.push('l2-degraded-step');
    } else {
      rationale.push('fail-local', 'l2-unset'); // never spill sensitive content to C
    }
  } else if (wantsConsult) {
    let ladderIdx = cLadderIndexForSkill(req.skillCeiling);
    if (degradation.consultStepDown) ladderIdx = Math.max(0, ladderIdx - 1); // top->sonnet->haiku->none
    if (ladderIdx === 0) {
      rationale.push('degraded-step-down-to-l1');
    } else {
      tier = 'C';
      consult = true;
      sanitize = true;
      model = modelForLadderIndex(ladderIdx);
      rationale.push(`c-ladder=${ladderIdx}`);
    }
  } else {
    rationale.push('l1-direct');
  }

  const clamp = generateClampConstraints(req.domain, req.skillCeiling);

  const effortBand = effortBandFor(req.effort, req.poolState.max);
  const baseTokens = ROUTER_TUNING.maxTokens.base * ROUTER_TUNING.effort.multiplier[effortBand];
  const maxTokens = Math.max(ROUTER_TUNING.maxTokens.floor, Math.round(baseTokens * degradation.maxTokensScale));

  return {
    tier,
    consult,
    model,
    maxTokens,
    contextDepth: degradation.contextDepth,
    clamp,
    sanitize,
    rationale: rationale.join('|'),
  };
}

// ── Execution ────────────────────────────────────────────────────────────

/**
 * model-client.ts's chat() has no per-call model override — it always
 * reads process.env.DAYA_C_MODEL for tier C. Rather than touch that file
 * (out of this WP's scope), the router honors its own within-C ladder pick
 * by toggling DAYA_C_MODEL for the duration of a single call and restoring
 * it in `finally`. NEEDS-FABLE: this races under truly concurrent C-tier
 * calls resolving to different ladder rungs at once — acceptable for
 * Phase 1's single-room test scale; a real per-call override param on
 * chat() would remove the need for this entirely.
 */
function withTemporaryEnv<T>(key: string, value: string, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[key];
  process.env[key] = value;
  return fn().finally(() => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  });
}

async function executeDecision(
  req: RouteRequest,
  decision: RoutingDecision,
  overrides: DayaClientOverrides,
): Promise<RouteAndChatResult> {
  // Clamp only ever governs entity-voiced (L1) output. A consult's answer
  // isn't the entity's phenomenal stream — it folds back into L1 cognition
  // later (WP9 ensemble) — so the abstracted consult query itself is not
  // clamped here.
  let messages: DayaChatMessage[] =
    decision.tier === 'L1' && decision.clamp
      ? [{ role: 'system', content: buildClampPromptText(decision.clamp) }, ...req.messages]
      : req.messages;

  if (decision.tier === 'C' && decision.sanitize) {
    const identifiers = req.identifiers ?? [];
    // assertClean's forbidden set is broader than what gets tokenized:
    // rawKeys (opaque DB ids) have no meaningful token to replace them
    // WITH, so stripAndForward never touches them — their only presence in
    // an outbound payload is a bug, which is exactly what this sweep is
    // for.
    const forbidden = [...identifiers, ...(req.rawKeys ?? [])];
    const stripped = messages.map((m) => ({ ...m, content: stripAndForward(m.content, identifiers).text }));
    const cleanliness = assertClean(stripped.map((m) => m.content).join('\n'), forbidden);
    if (!cleanliness.clean) {
      console.warn('[daya/router] assert-clean hard-fail — rerouting to degraded L1', {
        subsystem: req.subsystem,
        hitCount: cleanliness.hits.length,
      });
      const fallback: RoutingDecision = {
        tier: 'L1',
        consult: false,
        maxTokens: decision.maxTokens,
        contextDepth: decision.contextDepth,
        clamp: decision.clamp,
        sanitize: false,
        rationale: `${decision.rationale}|assert-clean-hard-fail|reroute-l1`,
      };
      return executeDecision(req, fallback, overrides);
    }
    messages = stripped;
  }

  const run = () =>
    chat(
      {
        tier: decision.tier,
        subsystem: req.subsystem,
        entityId: req.entityId,
        messages,
        maxTokens: decision.maxTokens,
        rationale: decision.rationale,
        sanitized: decision.sanitize,
      },
      overrides,
    );

  const result = decision.tier === 'C' && decision.model ? await withTemporaryEnv('DAYA_C_MODEL', decision.model, run) : await run();

  // Stage B clamp audit — sampled, non-blocking, never awaited by the
  // caller. Only meaningful on L1 (entity-voiced) output.
  if (decision.tier === 'L1' && decision.clamp) {
    void auditClampedOutput(
      { entityId: req.entityId, domain: req.domain ?? 'general', constraints: decision.clamp, output: result.text },
      { rate: ROUTER_TUNING.clampAuditRate, overrides },
    ).catch(() => {});
  }

  return { ...result, decision };
}

/**
 * The one entry point every entity-voicing DAYA subsystem uses instead of
 * calling model-client's chat() directly. Computes the routing decision
 * (decideRoute), applies clamping, enforces the sanitization boundary for
 * anything bound for C, and executes the call.
 */
export function routeAndChat(req: RouteRequest, overrides: DayaClientOverrides = {}): Promise<RouteAndChatResult> {
  const decision = decideRoute(req);
  return executeDecision(req, decision, overrides);
}
