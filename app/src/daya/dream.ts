/**
 * DAYA dream consolidation — the persona harness's sleep-analog cognitive
 * maintenance pass. Replaces the WP3 v0 stub `runDreamConsolidation`
 * (scheduler.ts re-exports this module's implementation unchanged).
 *
 * Per-tick procedure (WP10 spec §2, T0-PARAM-MAP §A/§C — DREAM_TUNING,
 * dream-tuning.ts):
 *  1. Cluster selection — group recent/labile/high-salience memories by
 *     shared entityRefs + keyword overlap + temporal proximity (code, no
 *     model), select up to N = round(3 * contextDepth) clusters, biased by
 *     salience, rumination re-selection, and recency/lability.
 *  2. Dream role call per selected cluster (tier L1, subsystem `dream`) ->
 *     {clusterTheme, links, retag, metaMemory, affectDrift}.
 *  3. Apply with T0 caps: clusterId hierarchy, retag drift (age-gradient
 *     distortability), gist meta-memory (sealLint-checked), affect drift
 *     (via services/daya-affect.ts so decay/history stay consistent).
 *  4. Salience maintenance sweep over every entity memory: power-law decay
 *     toward a floor, rehearsal credit with a spacing penalty.
 *
 * Rumination & trauma dynamics (WP10 spec §4, T0 §C) are deliberately
 * CODE-DRIVEN, not LLM-derived: a rumination-locked cluster's per-tick
 * deepening/healing uses the fixed T0 constants directly (ruminationStep /
 * reconsolidationHealStep below), independent of whatever numbers a given
 * dream-role call happens to propose. Ordinary (non-locked) clusters still
 * take their retag numbers from the model, clamped. This keeps the
 * load-bearing trauma mechanic fully deterministic (seeded PRNG only for the
 * counterweight lock-break roll) and testable without depending on any
 * particular model's numeric judgment.
 *
 * Lock/suppression/thorn-proposal state has no dedicated schema (no schema
 * changes in this WP beyond what §5 permits, and no dynamic here writes a
 * new DayaAffect dimension) — it lives in the cluster ANCHOR memory's
 * existing `classification` JSON blob, the same "already-flexible JSON
 * column" pattern recall.ts uses below for `labileUntilNextDream`.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { currentCycleOf } from '@/services/history';
import type { GrowthCharacter } from '@/types/growth';

import { resolveDayaEntityId } from './entity';
import { chat, type DayaClientOverrides } from './model-client';
import { writeMemoryEntry } from './memory';
import { stemmedJaccard, seededRandom01 } from './recall';
import { RECALL_TUNING } from './recall-tuning';
import { DREAM_TUNING } from './dream-tuning';
import { degradationForFraction, poolFraction } from './router';
import { enforceSeal } from './seal';
import { buildDreamPrompt } from './prompts/roles/dream';
import { applyDispositionEvent } from '@/services/daya-affect';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Local constants (WP10 engineering choices, not T0-sourced tunables) ───

/** Below this contextDepth, a tick is "affect-only maintenance": no dream-role
 * model calls, no meta-memory synthesis — cheap salience decay + whatever
 * purely-code-driven rumination stepping is already in flight (WP10 spec §1/§6). */
const LOW_DEPTH_THRESHOLD = 0.3;
/** Salience never decays to exactly zero — the system never forgets (Ruling 5). */
const SALIENCE_FLOOR = 0.02;
/** Candidate-pool sizing: how many memories the "recent" and "high-salience"
 * windows each contribute before dedup (§2.1's "recent + labile + high-salience"). */
const CANDIDATE_WINDOW = 20;
/** Two memories link into the same cluster if their stemmed-keyword Jaccard
 * is at least this, OR they share an entityRef, OR they're within the
 * temporal window AND share ANY keyword overlap. */
const CLUSTER_KEYWORD_THRESHOLD = 0.2;
const CLUSTER_TEMPORAL_WINDOW_CYCLES = 1;
/** Consecutive rumination-locked ticks before a cluster crosses into a
 * logged Thorn PROPOSAL (never auto-created — Ruling 7, WP10 spec §4). */
const THORN_PROPOSAL_TICKS = 3;

// ── Types ───────────────────────────────────────────────────────────────

export interface DreamMemoryRow {
  id: string;
  content: string;
  valence: number;
  arousal: number;
  salience: number;
  entityRefs: string[];
  narrativeCycle: number;
  source: string;
  classificationRaw: string;
  labile: boolean;
}

export interface MemoryCluster {
  /** Stable per-tick cluster identity, written onto DayaMemoryEntry.clusterId. */
  key: string;
  /** Earliest member — where lock/suppression/thorn-proposal markers live. */
  anchorId: string;
  memberIds: string[];
  meanValence: number;
  meanArousal: number;
  meanSalience: number;
  labileCount: number;
}

export interface DreamTickReport {
  contextDepth: number;
  tickIndex: number;
  clustersConsidered: number;
  clustersSelected: number;
  modelCallsMade: number;
  metaMemoriesCreated: string[];
  ruminationLocked: string[];
  ruminationHealed: string[];
  ruminationBroken: string[];
  thornProposals: string[];
}

// ── Pure dynamics: reconsolidation age gradient + drift caps (T0 §A1/§E) ──

/** distortability = (1 + ageCycles)^(-reconsolidationAgeExp) — young memories
 * retag freely; old ones barely move (Milekic & Alberini 2002). */
export function distortability(ageCycles: number): number {
  return Math.pow(1 + Math.max(0, ageCycles), -DREAM_TUNING.reconsolidationAgeExp);
}

/** Applies a raw proposed delta to `current`, capped at perTickDriftCap and
 * scaled by the memory's age-gradient distortability, clamped to [lo, hi]. */
export function applyDrift(current: number, rawDelta: number, ageCycles: number, lo: number, hi: number): number {
  const capped = clamp(rawDelta, -DREAM_TUNING.perTickDriftCap, DREAM_TUNING.perTickDriftCap);
  const scaled = capped * distortability(ageCycles);
  return clamp(current + scaled, lo, hi);
}

// ── Pure dynamics: salience maintenance sweep (T0 §A3/§E) ─────────────────

/** Power-law decay toward SALIENCE_FLOOR, resisted by the memory's own
 * salience (high-salience memories flatten more — never hit zero). */
export function decaySalienceStep(salience: number): number {
  const s = clamp(salience, 0, 1);
  const effectiveExp = RECALL_TUNING.decayExp * (1 - RECALL_TUNING.salienceDecayResistFactor * s);
  const ratio = Math.pow(2, -effectiveExp);
  return Math.max(SALIENCE_FLOOR, SALIENCE_FLOOR + (s - SALIENCE_FLOOR) * ratio);
}

/** Rehearsal credit for a memory touched this dream tick, penalized when it
 * was ALSO touched on the immediately preceding tick (spacing effect). */
export function rehearsalCredit(touchedThisTick: boolean, touchedLastTick: boolean): number {
  if (!touchedThisTick) return 0;
  return DREAM_TUNING.perTickSalienceGain * (touchedLastTick ? 1 - DREAM_TUNING.recentlyRehearsedPenalty : 1);
}

/** Full per-tick salience maintenance for one memory: decay + rehearsal credit. */
export function applyMaintenance(salience: number, touchedThisTick: boolean, touchedLastTick: boolean): number {
  return clamp(decaySalienceStep(salience) + rehearsalCredit(touchedThisTick, touchedLastTick), 0, 1);
}

// ── Pure dynamics: rumination / trauma loop (T0 §C/§E) ────────────────────

export function isRuminationCandidate(cluster: Pick<MemoryCluster, 'meanValence' | 'meanArousal'>): boolean {
  return cluster.meanValence < -0.4 && cluster.meanArousal > 0.5;
}

/** Deterministic per-pass deepening for a rumination-locked cluster member —
 * fixed T0 constants, not LLM-derived (see module docstring). */
export function ruminationStep(m: { valence: number; arousal: number; salience: number }): {
  valence: number;
  arousal: number;
  salience: number;
} {
  return {
    valence: clamp(m.valence + DREAM_TUNING.ruminationValenceStep, -1, 1),
    arousal: clamp(m.arousal + DREAM_TUNING.ruminationArousalStep, 0, 1),
    salience: clamp(m.salience + DREAM_TUNING.perTickSalienceGain, 0, 1),
  };
}

/** Two-event reconsolidation heal: moves valence toward neutral by the heal
 * magnitude, never overshooting past zero. Only called when BOTH the
 * reactivation and counterweight conditions are met (T0 §C). */
export function reconsolidationHealStep(valence: number): number {
  const magnitude = Math.abs(DREAM_TUNING.reconsolidationHeal);
  if (valence >= 0) return clamp(valence - magnitude, 0, 1);
  return clamp(valence + magnitude, -1, 0);
}

/** Seeded, deterministic lock-break roll — same discipline as recall.ts's
 * witPasses (FNV-1a + xorshift -> [0,1), no Math.random). */
export function ruminationLockShouldBreak(entityDaId: string, clusterAnchorId: string, tickIndex: number): boolean {
  const roll = seededRandom01(`dream-lock-break:${entityDaId}:${clusterAnchorId}:${tickIndex}`);
  return roll < DREAM_TUNING.counterweightBreakP;
}

export function applySuppressionDecay(strength: number): number {
  return Math.max(0, strength - DREAM_TUNING.suppressionDecayPerTick);
}

// ── Counterweight detection (T0 §C: social_contact | goal_progress | rest_safety | positive_recall) ──

export type CounterweightKind = 'social_contact' | 'goal_progress' | 'rest_safety' | 'positive_recall';

export interface CounterweightSignal {
  source: string;
  valence: number;
  rationaleTag?: string;
}

/**
 * Heuristic, code-side detector over the recent-memory window (no dedicated
 * ledger-tag taxonomy exists yet for these four categories — this reads the
 * signals already present on DayaMemoryEntry rows: source + classification
 * rationaleTag + valence). Deliberately conservative/additive rather than
 * exhaustive; a real Thorn/counterweight ledger is WP8's mechanics-coupling
 * concern (master handoff Wave 3).
 */
export function detectCounterweights(recent: CounterweightSignal[]): Set<CounterweightKind> {
  const found = new Set<CounterweightKind>();
  for (const m of recent) {
    const tag = (m.rationaleTag ?? '').toLowerCase();
    if (m.source === 'dialogue' && m.valence > 0.2) found.add('social_contact');
    if (tag.includes('vine') && m.valence > 0) found.add('goal_progress');
    if (tag.includes('rest')) found.add('rest_safety');
    if (m.valence > 0.3 && (m.source === 'perception' || m.source === 'dream')) found.add('positive_recall');
  }
  return found;
}

// ── Clustering (code, no model — WP10 spec §2.1) ──────────────────────────

function shouldLink(a: DreamMemoryRow, b: DreamMemoryRow): boolean {
  if (a.entityRefs.length > 0 && a.entityRefs.some((r) => b.entityRefs.includes(r))) return true;
  const kw = stemmedJaccard(a.content, b.content);
  if (kw >= CLUSTER_KEYWORD_THRESHOLD) return true;
  const near = Math.abs(a.narrativeCycle - b.narrativeCycle) <= CLUSTER_TEMPORAL_WINDOW_CYCLES;
  return near && kw > 0;
}

/** Deterministic union-find clustering: same input set always produces the
 * same clusters/anchor, no randomness, stable sort tie-breaks by id. */
export function buildClusters(memories: DreamMemoryRow[]): MemoryCluster[] {
  const sorted = [...memories].sort((x, y) => x.narrativeCycle - y.narrativeCycle || x.id.localeCompare(y.id));
  const parent = new Map<string, string>();
  for (const m of sorted) parent.set(m.id, m.id);

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (shouldLink(sorted[i], sorted[j])) union(sorted[i].id, sorted[j].id);
    }
  }

  const groups = new Map<string, DreamMemoryRow[]>();
  for (const m of sorted) {
    const root = find(m.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(m);
  }

  const clusters: MemoryCluster[] = [];
  for (const members of groups.values()) {
    const sortedMembers = [...members].sort((x, y) => x.narrativeCycle - y.narrativeCycle || x.id.localeCompare(y.id));
    const anchor = sortedMembers[0];
    const n = sortedMembers.length;
    clusters.push({
      key: `cluster:${anchor.id}`,
      anchorId: anchor.id,
      memberIds: sortedMembers.map((m) => m.id),
      meanValence: sortedMembers.reduce((s, m) => s + m.valence, 0) / n,
      meanArousal: sortedMembers.reduce((s, m) => s + m.arousal, 0) / n,
      meanSalience: sortedMembers.reduce((s, m) => s + m.salience, 0) / n,
      labileCount: sortedMembers.filter((m) => m.labile).length,
    });
  }
  return clusters.sort((a, b) => a.anchorId.localeCompare(b.anchorId));
}

/** N = round(3 * contextDepth), biased by salience + rumination re-selection
 * + recency/lability. Deterministic tie-break by anchorId. */
export function selectClusters(
  clusters: MemoryCluster[],
  contextDepth: number,
  lockedAnchorIds: ReadonlySet<string>,
): MemoryCluster[] {
  const n = Math.max(0, Math.round(3 * contextDepth));
  if (n === 0 || clusters.length === 0) return [];
  const scored = clusters.map((c) => {
    let score = c.meanSalience;
    if (lockedAnchorIds.has(c.anchorId) || isRuminationCandidate(c)) score += DREAM_TUNING.ruminationReselectBias;
    score += c.labileCount * 0.1;
    return { cluster: c, score };
  });
  scored.sort((a, b) => b.score - a.score || a.cluster.anchorId.localeCompare(b.cluster.anchorId));
  return scored.slice(0, n).map((s) => s.cluster);
}

// ── Anchor marker (lock/suppression state stored in classification JSON) ──

interface AnchorMarker {
  ruminationLock: boolean;
  ruminationTicks: number;
  suppressionStrength: number;
  thornProposed: boolean;
}

function parseClassificationRaw(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readAnchorMarker(raw: string): AnchorMarker {
  const c = parseClassificationRaw(raw);
  return {
    ruminationLock: c.ruminationLock === true,
    ruminationTicks: typeof c.ruminationTicks === 'number' ? c.ruminationTicks : 0,
    suppressionStrength: typeof c.suppressionStrength === 'number' ? c.suppressionStrength : 0,
    thornProposed: c.thornProposed === true,
  };
}

function mergeClassificationPatch(raw: string, patch: Record<string, unknown>): string {
  return JSON.stringify({ ...parseClassificationRaw(raw), ...patch });
}

function readLabile(raw: string): boolean {
  return parseClassificationRaw(raw).labileUntilNextDream === true;
}

/** Was this memory touched on the immediately preceding dream tick? Drives
 * the spacing penalty (T0 §A3) — read from the memory's own classification,
 * not a hardcoded assumption. */
function wasTouchedLastTick(m: DreamMemoryRow, tickIndex: number): boolean {
  return parseClassificationRaw(m.classificationRaw).lastTouchedTick === tickIndex - 1;
}

// ── Dream-role JSON contract (WP9 §5 prompt shell; WP10 owns the dynamics) ─

interface DreamRoleRetagItem {
  memoryId: string;
  valence?: number;
  arousal?: number;
  salience?: number;
}

interface DreamRoleResponse {
  clusterTheme: string;
  links: Array<{ memoryIds: string[]; relation: string }>;
  retag: DreamRoleRetagItem[];
  metaMemory: { content: string; valence: number; salience: number } | null;
  affectDrift: Partial<{ morale: number; stress: number; grief: number }>;
}

function parseDreamJson(raw: string): DreamRoleResponse | null {
  try {
    const cleaned = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof parsed.clusterTheme !== 'string') return null;

    const links = Array.isArray(parsed.links)
      ? (parsed.links as unknown[])
          .filter((l): l is { memoryIds: unknown; relation: unknown } => typeof l === 'object' && l !== null)
          .map((l) => ({
            memoryIds: Array.isArray(l.memoryIds) ? l.memoryIds.filter((x): x is string => typeof x === 'string') : [],
            relation: typeof l.relation === 'string' ? l.relation : 'echoes',
          }))
      : [];

    const retag = Array.isArray(parsed.retag)
      ? (parsed.retag as unknown[])
          .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null && typeof (r as Record<string, unknown>).memoryId === 'string')
          .map((r) => ({
            memoryId: r.memoryId as string,
            valence: typeof r.valence === 'number' ? r.valence : undefined,
            arousal: typeof r.arousal === 'number' ? r.arousal : undefined,
            salience: typeof r.salience === 'number' ? r.salience : undefined,
          }))
      : [];

    let metaMemory: DreamRoleResponse['metaMemory'] = null;
    if (parsed.metaMemory && typeof parsed.metaMemory === 'object') {
      const mm = parsed.metaMemory as Record<string, unknown>;
      if (typeof mm.content === 'string' && mm.content.trim().length > 0) {
        metaMemory = {
          content: mm.content,
          valence: typeof mm.valence === 'number' ? clamp(mm.valence, -1, 1) : 0,
          salience: typeof mm.salience === 'number' ? clamp(mm.salience, 0, 1) : 0.2,
        };
      }
    }

    const drift = parsed.affectDrift && typeof parsed.affectDrift === 'object' ? (parsed.affectDrift as Record<string, unknown>) : {};
    const affectDrift: DreamRoleResponse['affectDrift'] = {
      morale: typeof drift.morale === 'number' ? drift.morale : undefined,
      stress: typeof drift.stress === 'number' ? drift.stress : undefined,
      grief: typeof drift.grief === 'number' ? drift.grief : undefined,
    };

    return { clusterTheme: parsed.clusterTheme, links, retag, metaMemory, affectDrift };
  } catch {
    return null;
  }
}

function buildWp10DynamicsBlock(): string {
  return (
    `Numeric rules for your JSON (machinery, not shown to her): retag values are the ` +
    `memory's new valence/arousal/salience, not raw deltas — the caller computes the ` +
    `difference itself and clamps every per-tick change to at most ${DREAM_TUNING.perTickDriftCap} ` +
    `of movement, scaled down further for older memories, so propose honest, moderate ` +
    `numbers rather than extremes. Only propose a metaMemory when a real pattern across ` +
    `this cluster is worth naming as its own memory; leave it null otherwise, and never ` +
    `let its content mention dice, stats, or any game-mechanical term. affectDrift should ` +
    `be small (roughly -0.1..0.1 per dimension) reflecting how this cluster's residue ` +
    `nudges her morale/stress/grief overnight.`
  );
}

/** Applies an ordinary (non-rumination) cluster member's retag: LLM-proposed
 * target values (if any) become deltas from current, plus an optional
 * reconsolidation-contamination pull toward the cluster's dominant valence
 * for labile members whose own valence sign disagrees with it (WP10 §3). */
function applyOrdinaryRetag(
  m: DreamMemoryRow,
  proposed: DreamRoleRetagItem | undefined,
  nowCycle: number,
  touchedLastTick: boolean,
  contaminationTarget: number | null,
): { valence: number; arousal: number; salience: number } {
  const age = Math.max(0, nowCycle - m.narrativeCycle);

  let valenceRawDelta = proposed?.valence !== undefined ? proposed.valence - m.valence : 0;
  if (contaminationTarget !== null) valenceRawDelta += contaminationTarget - m.valence;
  const arousalRawDelta = proposed?.arousal !== undefined ? proposed.arousal - m.arousal : 0;

  const valence = applyDrift(m.valence, valenceRawDelta, age, -1, 1);
  const arousal = applyDrift(m.arousal, arousalRawDelta, age, 0, 1);

  const maintained = decaySalienceStep(m.salience) + rehearsalCredit(true, touchedLastTick);
  const salienceRawDelta = proposed?.salience !== undefined ? proposed.salience - m.salience : 0;
  const salienceDrift = clamp(salienceRawDelta, -DREAM_TUNING.perTickDriftCap, DREAM_TUNING.perTickDriftCap) * distortability(age);
  const salience = clamp(maintained + salienceDrift, 0, 1);

  return { valence, arousal, salience };
}

// ── Context loading ────────────────────────────────────────────────────────

function safeParseSheet(data: string | null | undefined): Partial<GrowthCharacter> | null {
  if (!data) return null;
  try {
    return JSON.parse(data) as Partial<GrowthCharacter>;
  } catch {
    return null;
  }
}

interface DreamContext {
  characterId: string;
  entityDaId: string;
  campaignId: string | null;
  cycle: number;
  name: string;
  contextDepth: number;
}

async function loadDreamContext(characterId: string): Promise<DreamContext> {
  const entityDaId = await resolveDayaEntityId(characterId);
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { name: true, campaignId: true, data: true },
  });
  const campaignId = character?.campaignId ?? null;
  const cycle = campaignId ? await currentCycleOf(campaignId) : 0;
  const sheet = safeParseSheet(character?.data);
  const frequency = sheet?.attributes?.frequency;
  const frac = frequency && frequency.level > 0 ? poolFraction({ current: frequency.current, max: frequency.level }) : 1;
  const contextDepth = degradationForFraction(frac).contextDepth;

  return { characterId, entityDaId, campaignId, cycle, name: character?.name ?? 'she', contextDepth };
}

function parseEntityRefs(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function toDreamMemoryRow(r: {
  id: string;
  content: string;
  valence: number;
  arousal: number;
  salience: number;
  entityRefs: string;
  narrativeCycle: number;
  source: string;
  classification: string;
}): DreamMemoryRow {
  return {
    id: r.id,
    content: r.content,
    valence: r.valence,
    arousal: r.arousal,
    salience: r.salience,
    entityRefs: parseEntityRefs(r.entityRefs),
    narrativeCycle: r.narrativeCycle,
    source: r.source,
    classificationRaw: r.classification,
    labile: readLabile(r.classification),
  };
}

function buildCandidatePool(all: DreamMemoryRow[]): DreamMemoryRow[] {
  const byRecency = [...all].sort((a, b) => b.narrativeCycle - a.narrativeCycle || b.id.localeCompare(a.id)).slice(0, CANDIDATE_WINDOW);
  const labile = all.filter((m) => m.labile);
  const highSalience = [...all].sort((a, b) => b.salience - a.salience).slice(0, CANDIDATE_WINDOW);
  const map = new Map<string, DreamMemoryRow>();
  for (const m of [...byRecency, ...labile, ...highSalience]) map.set(m.id, m);
  return [...map.values()];
}

async function proposeThorn(entityDaId: string, cluster: MemoryCluster, ticksLocked: number): Promise<void> {
  console.warn(
    `[daya/dream] Thorn PROPOSAL for entity ${entityDaId}: cluster ${cluster.key} rumination-locked ` +
      `${ticksLocked} ticks — flagged for GM confirmation (Phase 1: never auto-created, Ruling 7).`,
  );
  try {
    await prisma.dayaModelCall.create({
      data: {
        entityId: entityDaId,
        subsystem: 'thorn_proposal',
        tier: 'PROPOSAL',
        model: 'n/a',
        tokensIn: 0,
        tokensOut: 0,
        usd: 0,
        krma: 0,
        sanitized: true,
        rationale: `cluster=${cluster.key}|ticksLocked=${ticksLocked}|meanValence=${cluster.meanValence.toFixed(2)}|meanArousal=${cluster.meanArousal.toFixed(2)}`,
      },
    });
  } catch (err) {
    console.error('[daya/dream] failed to write thorn_proposal audit row (non-fatal):', err);
  }
}

// ── Main entry point ───────────────────────────────────────────────────────

/**
 * Runs one dream tick for the entity identified by `characterId` (the
 * Character id — same DayaTrigger.entityId convention every other subsystem
 * uses; resolved to a DayaEntity.id internally). Never throws: a failed
 * per-cluster dream-role call is logged and that cluster falls back to
 * code-only dynamics; the tick as a whole always completes and reports what
 * it did.
 */
export async function runDreamConsolidation(
  characterId: string,
  overrides: DayaClientOverrides = {},
): Promise<DreamTickReport> {
  const ctx = await loadDreamContext(characterId);

  const tickMarkers = await prisma.dayaMemoryEntry.findMany({
    where: { entityId: ctx.entityDaId, source: 'dream' },
    select: { classification: true },
  });
  const tickIndex = tickMarkers.filter((r) => parseClassificationRaw(r.classification).kind === 'tick_marker').length;

  const rows = await prisma.dayaMemoryEntry.findMany({ where: { entityId: ctx.entityDaId } });
  // Tick-marker rows are pure scheduler bookkeeping (see scheduler.ts's
  // dreamTickHandler) — never phenomenal content, never eligible for
  // clustering/retag/maintenance. Real dream-authored content (meta-memories,
  // source 'dream' but NOT a tick marker) still participates normally.
  const all = rows.map(toDreamMemoryRow).filter((m) => parseClassificationRaw(m.classificationRaw).kind !== 'tick_marker');

  const report: DreamTickReport = {
    contextDepth: ctx.contextDepth,
    tickIndex,
    clustersConsidered: 0,
    clustersSelected: 0,
    modelCallsMade: 0,
    metaMemoriesCreated: [],
    ruminationLocked: [],
    ruminationHealed: [],
    ruminationBroken: [],
    thornProposals: [],
  };

  if (all.length === 0) return report;

  const candidatePool = buildCandidatePool(all);
  const clusters = buildClusters(candidatePool);
  report.clustersConsidered = clusters.length;

  const lockedAnchorIds = new Set(
    clusters.filter((c) => readAnchorMarker(all.find((m) => m.id === c.anchorId)!.classificationRaw).ruminationLock).map((c) => c.anchorId),
  );

  const isLowDepth = ctx.contextDepth < LOW_DEPTH_THRESHOLD;
  const selected = selectClusters(clusters, ctx.contextDepth, lockedAnchorIds);
  report.clustersSelected = selected.length;

  // Counterweight detection over the same recent candidate window (§4:
  // "detectable from recent ledger sources/tags").
  const counterweights = detectCounterweights(
    candidatePool.map((m) => ({
      source: m.source,
      valence: m.valence,
      rationaleTag: typeof parseClassificationRaw(m.classificationRaw).rationaleTag === 'string'
        ? (parseClassificationRaw(m.classificationRaw).rationaleTag as string)
        : undefined,
    })),
  );
  const counterweightPresent = counterweights.size > 0;

  const selectedIds = new Set(selected.flatMap((c) => c.memberIds));
  const updates = new Map<string, { valence?: number; arousal?: number; salience?: number; clusterId?: string; classificationPatch: Record<string, unknown> }>();
  const affectTotals = { morale: 0, stress: 0, grief: 0 };
  let anyAffect = false;

  function queueUpdate(id: string, patch: { valence?: number; arousal?: number; salience?: number; clusterId?: string; classificationPatch?: Record<string, unknown> }) {
    const existing = updates.get(id) ?? { classificationPatch: {} };
    updates.set(id, {
      valence: patch.valence ?? existing.valence,
      arousal: patch.arousal ?? existing.arousal,
      salience: patch.salience ?? existing.salience,
      clusterId: patch.clusterId ?? existing.clusterId,
      classificationPatch: { ...existing.classificationPatch, ...(patch.classificationPatch ?? {}) },
    });
  }

  for (const cluster of selected) {
    const members = all.filter((m) => cluster.memberIds.includes(m.id));
    const anchor = members.find((m) => m.id === cluster.anchorId)!;
    const anchorMarker = readAnchorMarker(anchor.classificationRaw);
    const wasLocked = anchorMarker.ruminationLock;
    const ruminationCandidate = isRuminationCandidate(cluster) || wasLocked;

    let dreamResp: DreamRoleResponse | null = null;
    if (!isLowDepth) {
      try {
        const prompt = buildDreamPrompt({ name: ctx.name, wp10DynamicsBlock: buildWp10DynamicsBlock() });
        const listing = members.map((m) => `[${m.id}] (valence ${m.valence.toFixed(2)}, arousal ${m.arousal.toFixed(2)}) ${m.content}`).join('\n');
        const result = await chat(
          {
            tier: 'L1',
            subsystem: 'dream',
            entityId: ctx.entityDaId,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: listing },
            ],
            maxTokens: 400,
          },
          overrides,
        );
        report.modelCallsMade += 1;
        dreamResp = parseDreamJson(result.text);
      } catch (err) {
        console.error(`[daya/dream] dream role call failed for cluster ${cluster.key} (falling back to code-only dynamics):`, err);
      }
    }

    const retagById = new Map((dreamResp?.retag ?? []).map((r) => [r.memoryId, r]));

    if (ruminationCandidate && !counterweightPresent) {
      // Deepen — no counterweight since last tick; the loop strengthens.
      for (const m of members) {
        const stepped = ruminationStep(m);
        queueUpdate(m.id, {
          valence: stepped.valence,
          arousal: stepped.arousal,
          salience: stepped.salience,
          clusterId: cluster.key,
          classificationPatch: { labileUntilNextDream: false, lastTouchedTick: tickIndex },
        });
      }
      const ticksLocked = anchorMarker.ruminationTicks + 1;
      queueUpdate(anchor.id, { classificationPatch: { ruminationLock: true, ruminationTicks: ticksLocked } });
      report.ruminationLocked.push(anchor.id);
      if (ticksLocked >= THORN_PROPOSAL_TICKS && !anchorMarker.thornProposed) {
        await proposeThorn(ctx.entityDaId, cluster, ticksLocked);
        queueUpdate(anchor.id, { classificationPatch: { thornProposed: true, suppressionStrength: 1 } });
        report.thornProposals.push(anchor.id);
      }
    } else if (ruminationCandidate && counterweightPresent && wasLocked) {
      // Two-event heal: this cluster is reactivated (selected) THIS tick and
      // a counterweight is present — durable healing (T0 §C).
      for (const m of members) {
        const healedValence = reconsolidationHealStep(m.valence);
        const maintained = clamp(decaySalienceStep(m.salience) + rehearsalCredit(true, wasTouchedLastTick(m, tickIndex)), 0, 1);
        queueUpdate(m.id, {
          valence: healedValence,
          salience: maintained,
          clusterId: cluster.key,
          classificationPatch: { labileUntilNextDream: false, lastTouchedTick: tickIndex },
        });
      }
      report.ruminationHealed.push(anchor.id);
      if (ruminationLockShouldBreak(ctx.entityDaId, cluster.anchorId, tickIndex)) {
        queueUpdate(anchor.id, { classificationPatch: { ruminationLock: false, ruminationTicks: 0 } });
        report.ruminationBroken.push(anchor.id);
      } else {
        queueUpdate(anchor.id, { classificationPatch: { ruminationLock: true } });
      }
    } else {
      // Ordinary cluster (not a rumination candidate, or a candidate that
      // never locked because a counterweight was already present the first
      // time it qualified) — normal retag + reconsolidation contamination.
      const dominantSign = Math.sign(cluster.meanValence);
      for (const m of members) {
        const contaminate = m.labile && dominantSign !== 0 && Math.sign(m.valence) !== dominantSign;
        const updated = applyOrdinaryRetag(m, retagById.get(m.id), ctx.cycle, wasTouchedLastTick(m, tickIndex), contaminate ? cluster.meanValence : null);
        queueUpdate(m.id, {
          valence: updated.valence,
          arousal: updated.arousal,
          salience: updated.salience,
          clusterId: cluster.key,
          classificationPatch: { labileUntilNextDream: false, lastTouchedTick: tickIndex },
        });
      }
      if (wasLocked) queueUpdate(anchor.id, { classificationPatch: { ruminationLock: false, ruminationTicks: 0 } });
    }

    if (dreamResp?.metaMemory && DREAM_TUNING.gistSynthesisEnabled) {
      const sealed = await enforceSeal(dreamResp.metaMemory.content, {
        entityId: ctx.entityDaId,
        subsystem: 'dream',
        fallback: 'Something about that stretch of time sits differently now, though its shape stays vague.',
      });
      const entityRefs = [...new Set(members.flatMap((m) => m.entityRefs))];
      const metaSalience = Math.min(dreamResp.metaMemory.salience, 0.4);
      const metaRow = await writeMemoryEntry({
        entityId: ctx.entityDaId,
        narrativeCycle: ctx.cycle,
        source: 'dream',
        content: sealed.text,
        valence: clamp(dreamResp.metaMemory.valence, -1, 1),
        arousal: 0,
        salience: metaSalience,
        entityRefs,
        classification: { contentCategory: 'meta', sensitivity: 'safe', icOoc: 'IC', fidelity: 'gist', clusterTheme: dreamResp.clusterTheme, rationaleTag: 'dream consolidation' },
        clusterId: cluster.key,
        parentMemoryId: anchor.id,
      });
      report.metaMemoriesCreated.push(metaRow.id);
    }

    if (dreamResp?.affectDrift) {
      const d = dreamResp.affectDrift;
      if (typeof d.morale === 'number' || typeof d.stress === 'number' || typeof d.grief === 'number') {
        affectTotals.morale += clamp(d.morale ?? 0, -0.1, 0.1);
        affectTotals.stress += clamp(d.stress ?? 0, -0.1, 0.1);
        affectTotals.grief += clamp(d.grief ?? 0, -0.1, 0.1);
        anyAffect = true;
      }
    }
  }

  // Extinction path: previously-locked clusters that were considered but NOT
  // selected/reactivated this tick — suppression erodes, not the memory
  // itself (T0 §C: extinction is not erasure).
  for (const cluster of clusters) {
    if (selected.some((s) => s.key === cluster.key)) continue;
    const anchor = all.find((m) => m.id === cluster.anchorId);
    if (!anchor) continue;
    const marker = readAnchorMarker(anchor.classificationRaw);
    if (marker.thornProposed && marker.suppressionStrength > 0) {
      queueUpdate(anchor.id, { classificationPatch: { suppressionStrength: applySuppressionDecay(marker.suppressionStrength) } });
    }
  }

  // Salience-only maintenance sweep for every memory NOT touched above.
  for (const m of all) {
    if (updates.has(m.id)) continue;
    if (selectedIds.has(m.id)) continue; // defensive; should already be queued
    const marker = parseClassificationRaw(m.classificationRaw);
    const touchedLastTick = marker.lastTouchedTick === tickIndex - 1;
    const salience = applyMaintenance(m.salience, false, touchedLastTick);
    if (salience !== m.salience) {
      queueUpdate(m.id, { salience });
    }
  }

  await Promise.all(
    [...updates.entries()].map(([id, patch]) => {
      const row = all.find((m) => m.id === id)!;
      const classification = mergeClassificationPatch(row.classificationRaw, patch.classificationPatch);
      return prisma.dayaMemoryEntry
        .update({
          where: { id },
          data: {
            classification,
            ...(patch.valence !== undefined ? { valence: patch.valence } : {}),
            ...(patch.arousal !== undefined ? { arousal: patch.arousal } : {}),
            ...(patch.salience !== undefined ? { salience: patch.salience } : {}),
            ...(patch.clusterId !== undefined ? { clusterId: patch.clusterId } : {}),
          },
        })
        .catch((err) => {
          console.error(`[daya/dream] failed to persist dream-tick update for memory ${id} (non-fatal):`, err);
        });
    }),
  );

  if (anyAffect) {
    const deltas = {
      morale: clamp(affectTotals.morale, -0.3, 0.3),
      stress: clamp(affectTotals.stress, -0.3, 0.3),
      grief: clamp(affectTotals.grief, -0.3, 0.3),
    };
    await applyDispositionEvent(characterId, {
      kind: 'dream_consolidation',
      deltas,
      beat: 'Sleep sorted through the residue of the last stretch of days, and something in me shifted for it.',
    });
  }

  return report;
}
