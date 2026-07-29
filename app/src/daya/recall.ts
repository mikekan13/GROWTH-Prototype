/**
 * DAYA recall — persona harness memory layer, stat-gated retrieval.
 *
 * Scoring follows the generative-agents pattern (relevance + recency +
 * salience + mood-congruence), adapted for a phase-1 SQLite store (no vector
 * search — relevance is a code-side stemmed keyword Jaccard over content,
 * plus an entityRefs-overlap bonus). Wisdom gates BREADTH (what can surface
 * at all); Wit gates SPEED (what surfaces this moment vs. later); Thorns own
 * suppression/distortion; mood tilts which memories win ties. See
 * RECALL_TUNING (recall-tuning.ts) for every numeric knob.
 *
 * Everything that crosses into an entity's phenomenal stream from here
 * (recall prose, failed-recall prose) is sealLint-checked first — see
 * localSealLint below. src/daya/seal.ts is the canonical, full-pattern
 * lint (owned by the six-role-prompts work); this is a minimal local
 * subset so WP4 doesn't block on it landing first.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { chat, type DayaClientOverrides } from './model-client';
import { writeMemoryEntry } from './memory';
import { RECALL_TUNING } from './recall-tuning';

export { RECALL_TUNING };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Public API types (frozen per spec — do not add/rename fields) ─────────

export type ThornBlock = {
  subjectPattern: string;
  mode: 'suppress' | 'distort' | 'affect-only';
  strength: number;
};

export interface RecallRequest {
  entityId: string; // DayaEntity.id
  cue: string;
  cueRefs?: string[];
  mood: { morale: number; stress: number; grief: number };
  soulState: { wisdomMax: number; wisdomCur: number; witMax: number; witCur: number };
  thornBlocks: ThornBlock[];
  nowCycle: number;
  budget?: number;
}

export interface SurfacedMemory {
  memoryId: string;
  score: number;
}

export interface RecallResult {
  prose: string | null;
  surfaced: SurfacedMemory[];
  failedFeel: string | null;
  deferred: string[];
}

// ── Minimal local seal-lint (WP9 owns the canonical src/daya/seal.ts) ─────

const LOCAL_SEAL_HARD_PATTERN =
  /\b(DR\s?\d+|d(4|6|8|10|12|20)\b|[+-]\d+\s?(to|on)\s?\w+|\d+\s?\/\s?\d+\s?(pool|points)|KRMA|character sheet|game master|\bGM\b|\bNPC\b|dice|roll a|player character)\b/i;

/** true = clean (no HARD mechanical-vocabulary hit). */
export function localSealLint(text: string): boolean {
  return !LOCAL_SEAL_HARD_PATTERN.test(text);
}

const SAFE_FALLBACK_PROSE = 'Something surfaces, though the shape of it resists words right now.';

// ── Stemmed keyword Jaccard (relevance, no vector store in phase 1) ───────

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'to', 'of', 'and', 'or',
  'in', 'on', 'at', 'it', 'you', 'your', 'i', 'me', 'my', 'that', 'this', 'with', 'for', 'as',
  'do', 'did', 'does', 'what', 'who', 'about', 'tell', 'me', 'we', 'us', 'them', 'they',
]);

function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

export function tokenizeStemmed(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const out = new Set<string>();
  for (const w of words) {
    if (STOPWORDS.has(w) || w.length < 2) continue;
    out.add(stem(w));
  }
  return out;
}

/** 0..1 Jaccard similarity over stemmed, stopword-filtered token sets. */
export function stemmedJaccard(a: string, b: string): number {
  const A = tokenizeStemmed(a);
  const B = tokenizeStemmed(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const t of A) if (B.has(t)) intersection++;
  const union = A.size + B.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * relevance = keyword Jaccard scaled to 0..0.6, + 0.3 if any cueRef appears
 * in the memory's entityRefs, + 0.1 same-source-thread bonus. Phase 1 has no
 * thread/session id on the cue itself, so sameSourceThread is a caller-
 * supplied hint (inert/false until a caller has one to give).
 */
export function computeRelevance(
  cue: string,
  cueRefs: string[],
  content: string,
  entityRefs: string[],
  sameSourceThread = false,
): number {
  const keywordScore = stemmedJaccard(cue, content) * 0.6;
  const refsOverlap = cueRefs.length > 0 && entityRefs.some((r) => cueRefs.includes(r)) ? 0.3 : 0;
  const threadBonus = sameSourceThread ? 0.1 : 0;
  return clamp(keywordScore + refsOverlap + threadBonus, 0, 1);
}

// ── Recency: power-law decay, salience resists it (T0 §A/§E) ──────────────

/**
 * (1 + deltaCycles)^(-effectiveExp), effectiveExp = r * (1 - resistFactor *
 * salience). Old memories flatten toward a floor, never hit zero — the
 * system never forgets; retrieval just weakens (Ruling 5).
 */
export function computeRecency(deltaCycles: number, salience: number): number {
  const effectiveExp = RECALL_TUNING.decayExp * (1 - RECALL_TUNING.salienceDecayResistFactor * clamp(salience, 0, 1));
  const d = Math.max(0, deltaCycles);
  return Math.pow(1 + d, -effectiveExp);
}

// ── Mood congruence: cosine over (valence, arousal), asymmetric gain ──────

function cosine(ax: number, ay: number, bx: number, by: number): number {
  const dot = ax * bx + ay * by;
  const magA = Math.hypot(ax, ay);
  const magB = Math.hypot(bx, by);
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

/** Negative valence + high arousal reads as a "threat-tagged" memory for the stress-sharpening lever. */
function isThreatTagged(valence: number, arousal: number): boolean {
  return valence < -0.3 && arousal > 0.5;
}

/**
 * Compares the current mood vector to a memory's encode-time (valence,
 * arousal) via cosine similarity, then applies: asymmetric gain (positive
 * mood pulls harder than negative — T0 §B), arousal-scaled sensitivity,
 * mood-repair (negative mood recruits positive memories to self-regulate,
 * unless a rumination lock is active), and threat-sharpening (high current
 * stress boosts threat-tagged memories specifically).
 */
export function computeMoodCongruence(
  mood: { morale: number; stress: number; grief: number },
  mem: { valence: number; arousal: number },
  ruminationLockActive = false,
): number {
  const moodValence = mood.morale - 0.5 * mood.grief;
  const moodArousal = clamp(mood.stress, 0, 1);
  const cos = cosine(moodValence, moodArousal, mem.valence, mem.arousal);
  // Gain keys off the CURRENT mood's sign (positive mood pulls harder than
  // negative mood, per T0 §B) — not the cosine sign, which is "does this
  // memory match" rather than "how moody is the puller."
  const gain = moodValence >= 0 ? RECALL_TUNING.moodGainPositive : RECALL_TUNING.moodGainNegative;
  let congruence = cos * gain;
  // High-arousal memories are more mood-sensitive; floor at half so calm memories aren't inert.
  congruence *= 0.5 + 0.5 * clamp(mem.arousal, 0, 1);

  if (mood.morale < -0.3 && mood.stress < 0.8 && !ruminationLockActive && mem.valence > 0) {
    congruence += RECALL_TUNING.moodRepairBias;
  }
  if (mood.stress > 0.6 && isThreatTagged(mem.valence, mem.arousal)) {
    congruence += RECALL_TUNING.stressThreatSharpen;
  }
  return clamp(congruence, -0.5, 0.5);
}

// ── Thorn blocks ────────────────────────────────────────────────────────

function matchThornBlock(content: string, entityRefs: string[], thornBlocks: ThornBlock[]): ThornBlock | null {
  for (const block of thornBlocks) {
    if (block.strength <= 0) continue; // inert block
    const p = block.subjectPattern.toLowerCase();
    if (content.toLowerCase().includes(p) || entityRefs.some((r) => r.toLowerCase() === p)) {
      return block;
    }
  }
  return null;
}

// ── Wisdom (breadth) + Wit (speed) gates ───────────────────────────────────

/** Shared pool normalization (Ruling 23 calibration: 30-40 human). */
export function poolNorm(max: number): number {
  return clamp(max / RECALL_TUNING.wisdomNormDivisor, 0, RECALL_TUNING.wisdomNormCap);
}

export function wisdomThreshold(wisdomMax: number): number {
  return RECALL_TUNING.thetaBase * (1 - RECALL_TUNING.wisdomBreadthFactor * poolNorm(wisdomMax));
}

/** Drained current-Wisdom narrows the budget (never below currentPoolNarrowFloor of the max-derived n). */
function currentWisdomNarrowing(wisdomMax: number, wisdomCur: number): number {
  if (wisdomMax <= 0) return RECALL_TUNING.currentPoolNarrowFloor;
  const frac = clamp(wisdomCur / wisdomMax, 0, 1);
  return RECALL_TUNING.currentPoolNarrowFloor + (1 - RECALL_TUNING.currentPoolNarrowFloor) * frac;
}

export function wisdomBudget(wisdomMax: number, wisdomCur: number, contextDepthMultiplier = 1): number {
  const n = 1 + Math.round(RECALL_TUNING.wisdomBudgetGain * poolNorm(wisdomMax));
  const narrowed = n * currentWisdomNarrowing(wisdomMax, wisdomCur) * contextDepthMultiplier;
  return Math.max(0, Math.round(narrowed));
}

export function witImmediateProbability(witMax: number): number {
  return RECALL_TUNING.witImmediateBase + RECALL_TUNING.witImmediateGain * poolNorm(witMax);
}

/** Deterministic FNV-1a + xorshift hash to [0, 1) — same discipline as WP5 seeded noise. */
export function seededRandom01(seedKey: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedKey.length; i++) {
    h ^= seedKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h << 13;
  h ^= h >>> 17;
  h ^= h << 5;
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

/** Deterministic per (entityId, memoryId, nowCycle) — same request replays identically. */
export function witPasses(entityId: string, memoryId: string, nowCycle: number, witMax: number): boolean {
  const p = witImmediateProbability(witMax);
  const roll = seededRandom01(`wit:${entityId}:${memoryId}:${nowCycle}`);
  return roll < p;
}

function pickBySeed<T>(arr: readonly T[], seedKey: string): T {
  const idx = Math.floor(seededRandom01(seedKey) * arr.length) % arr.length;
  return arr[idx];
}

// ── Scoring ─────────────────────────────────────────────────────────────

export interface ParsedMemory {
  id: string;
  content: string;
  valence: number;
  arousal: number;
  salience: number;
  entityRefs: string[];
  narrativeCycle: number;
}

export interface ScoredCandidate {
  memory: ParsedMemory;
  relevance: number;
  recency: number;
  moodCongruence: number;
  score: number; // -Infinity when a Thorn suppresses/affect-only-blocks it
  thornMatch: ThornBlock | null;
}

/** Pure — no DB/network. score(m) = w_rel*relevance + w_rec*recency + w_sal*salience + w_mood*moodCongruence, minus blocks. */
export function scoreCandidate(
  memory: ParsedMemory,
  cue: string,
  cueRefs: string[],
  mood: { morale: number; stress: number; grief: number },
  nowCycle: number,
  thornBlocks: ThornBlock[],
): ScoredCandidate {
  const relevance = computeRelevance(cue, cueRefs, memory.content, memory.entityRefs);
  const recency = computeRecency(Math.max(0, nowCycle - memory.narrativeCycle), memory.salience);
  const moodCongruence = computeMoodCongruence(mood, { valence: memory.valence, arousal: memory.arousal });
  const thornMatch = matchThornBlock(memory.content, memory.entityRefs, thornBlocks);

  let score =
    RECALL_TUNING.wRel * relevance +
    RECALL_TUNING.wRec * recency +
    RECALL_TUNING.wSal * memory.salience +
    RECALL_TUNING.wMood * moodCongruence;

  if (thornMatch && (thornMatch.mode === 'suppress' || thornMatch.mode === 'affect-only')) {
    score = -Infinity;
  }

  return { memory, relevance, recency, moodCongruence, score, thornMatch };
}

// ── Failed-recall / distort prose templates ────────────────────────────

export const FAILED_REACH_TEMPLATES = [
  "It's right there and it won't come.",
  'Something in you reaches for it and finds only its edge.',
  'You know you know this — it stays just out of grasp.',
] as const;

export const AFFECT_ONLY_TEMPLATES = [
  "Your chest tightens and you don't know why.",
  'A weight settles in you, without a name.',
  'Something in you flinches at nothing you can point to.',
] as const;

const DISTORT_TEMPLATES = [
  "Something about that time, but its edges have gone soft — you can't place the details.",
  'A blurred shape of a memory drifts up, the gist of it without the particulars.',
] as const;

// ── Optional rerank (off by default — DAYA_RECALL_RERANK=enabled) ─────────

async function maybeRerank(
  candidates: ScoredCandidate[],
  cue: string,
  overrides: DayaClientOverrides,
): Promise<ScoredCandidate[]> {
  if (process.env.DAYA_RECALL_RERANK !== 'enabled') return candidates;
  const top20 = candidates.slice(0, 20);
  if (top20.length <= 1) return candidates;

  try {
    const listing = top20.map((c, i) => `${i}: ${c.memory.content}`).join('\n');
    const result = await chat(
      {
        tier: 'C',
        subsystem: 'recall',
        messages: [
          {
            role: 'system',
            content: 'Rerank these memory snippets by relevance to the cue. Output ONLY a JSON array of the indices, most relevant first, same length as given.',
          },
          { role: 'user', content: `Cue: ${cue}\n${listing}` },
        ],
        maxTokens: 200,
        temperature: 0,
      },
      overrides,
    );
    const order = JSON.parse(result.text.trim()) as unknown;
    if (
      !Array.isArray(order) ||
      order.length !== top20.length ||
      order.some((i) => typeof i !== 'number' || i < 0 || i >= top20.length)
    ) {
      return candidates;
    }
    const reranked = (order as number[]).map((i) => top20[i]);
    return [...reranked, ...candidates.slice(20)];
  } catch {
    return candidates; // rerank failure never breaks recall
  }
}

// ── Recall entry point ─────────────────────────────────────────────────

function parseEntityRefs(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Best-effort merge of a JSON patch into a classification string, preserving
 * unknown keys — used to flag a surfaced memory `labileUntilNextDream` (T0
 * §A2: recall re-opens a memory to reconsolidation) without a schema change;
 * `classification` is already a free-form JSON string column. Never throws —
 * an unparseable existing blob is replaced outright rather than blocking. */
function mergeClassification(raw: string, patch: Record<string, unknown>): string {
  try {
    const existing = JSON.parse(raw) as Record<string, unknown>;
    return JSON.stringify({ ...existing, ...patch });
  } catch {
    return JSON.stringify(patch);
  }
}

export async function recall(req: RecallRequest, overrides: DayaClientOverrides = {}): Promise<RecallResult> {
  const cueRefs = req.cueRefs ?? [];
  const rows = await prisma.dayaMemoryEntry.findMany({ where: { entityId: req.entityId } });
  const classificationById = new Map(rows.map((r) => [r.id, r.classification]));

  const parsed: ParsedMemory[] = rows.map((r) => ({
    id: r.id,
    content: r.content,
    valence: r.valence,
    arousal: r.arousal,
    salience: r.salience,
    entityRefs: parseEntityRefs(r.entityRefs),
    narrativeCycle: r.narrativeCycle,
  }));

  const scored = parsed.map((m) => scoreCandidate(m, req.cue, cueRefs, req.mood, req.nowCycle, req.thornBlocks));

  const theta = wisdomThreshold(req.soulState.wisdomMax);
  const budget = req.budget ?? wisdomBudget(req.soulState.wisdomMax, req.soulState.wisdomCur);

  let passing = scored
    .filter((c) => Number.isFinite(c.score) && c.score >= theta)
    .sort((a, b) => b.score - a.score);

  passing = await maybeRerank(passing, req.cue, overrides);

  const withinBudget = passing.slice(0, Math.max(0, budget));

  const surfacedList: ScoredCandidate[] = [];
  const deferred: string[] = [];
  for (const c of withinBudget) {
    if (witPasses(req.entityId, c.memory.id, req.nowCycle, req.soulState.witMax)) {
      surfacedList.push(c);
    } else {
      deferred.push(c.memory.id);
    }
  }

  // Rehearsal: every surfaced memory gets a salience touch (fire-and-forget-safe, awaited here for test determinism),
  // and is flagged labileUntilNextDream (T0 §A2: retrieval re-opens a memory to modification; WP10's dream tick is
  // the only consumer of this flag and clears it once processed).
  await Promise.all(
    surfacedList.map((c) => {
      const next = clamp(c.memory.salience + RECALL_TUNING.rehearsalBoost, 0, RECALL_TUNING.rehearsalBoostCap);
      const classification = mergeClassification(classificationById.get(c.memory.id) ?? '{}', { labileUntilNextDream: true });
      return prisma.dayaMemoryEntry
        .update({ where: { id: c.memory.id }, data: { salience: next, classification } })
        .catch(() => undefined);
    }),
  );

  // Prose: normal content, or a vague distort line for Thorn-distorted memories.
  const proseLines = surfacedList.map((c) =>
    c.thornMatch?.mode === 'distort' ? pickBySeed(DISTORT_TEMPLATES, `distort:${c.memory.id}`) : c.memory.content,
  );
  let prose: string | null = proseLines.length > 0 ? proseLines.join(' ') : null;
  if (prose && !localSealLint(prose)) prose = SAFE_FALLBACK_PROSE;

  // Failed recall as experience (Ruling 5): the best-relevance candidate clearly
  // reached (relevance > thetaReach) but some gate (threshold/budget/wit/Thorn)
  // stopped it from surfacing.
  let failedFeel: string | null = null;
  if (scored.length > 0) {
    const best = scored.reduce((a, b) => (b.relevance > a.relevance ? b : a));
    const surfacedIds = new Set(surfacedList.map((s) => s.memory.id));
    if (best.relevance > RECALL_TUNING.thetaReach && !surfacedIds.has(best.memory.id)) {
      const templates = best.thornMatch?.mode === 'affect-only' ? AFFECT_ONLY_TEMPLATES : FAILED_REACH_TEMPLATES;
      failedFeel = pickBySeed(templates, `failedfeel:${req.entityId}:${best.memory.id}:${req.nowCycle}`);
      if (!localSealLint(failedFeel)) failedFeel = SAFE_FALLBACK_PROSE;

      // Self-ingest the failed attempt itself (source perception, low salience).
      // Awaited so the write is durable before recall() returns (never throws
      // outward — a self-ingest failure is logged, not propagated).
      try {
        await writeMemoryEntry({
          entityId: req.entityId,
          narrativeCycle: req.nowCycle,
          source: 'perception',
          content: failedFeel,
          valence: 0,
          arousal: 0.1,
          salience: 0.1,
          classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'failed recall attempt' },
        });
      } catch (err) {
        console.error('[daya/recall] failed-recall self-ingest failed (non-fatal):', err);
      }
    }
  }

  return {
    prose,
    surfaced: surfacedList.map((c) => ({ memoryId: c.memory.id, score: c.score })),
    failedFeel,
    deferred,
  };
}
