/**
 * Persona harness perceptual layer — pure math core (renderer-math.ts).
 *
 * Everything in this file is deterministic and DB-free: given the same
 * inputs it always returns the same outputs. `renderer.ts` is the thin,
 * DB-touching wrapper that resolves an observer's current revision epoch,
 * calls into this module for the "what can be known, with what error" math,
 * then hands the result to a single model call for "how it sounds."
 *
 * No `Math.random()` anywhere in this file — every source of variation is
 * seeded from `(entityId, subjectKey, revisionEpoch)` via a small FNV-1a
 * hash feeding a mulberry32 PRNG, so a believed value never jitters between
 * consecutive reads at the same revision epoch.
 */

// ── Shared types ────────────────────────────────────────────────────────

export type RenderSubject = 'self-stat' | 'possession' | 'environment' | 'other-entity' | 'relationship';

/** Distortion operators, each a signed strength -1..1, default 0. */
export interface BiasProfile {
  selfRegard?: number;    // own-competence reads: +hubris overreads, -self-doubt underreads
  optimism?: number;      // valence-directional shift on world/other reads
  projection?: number;    // observer's own mood attributed to other-entity reads
  denial?: number;        // dampens perceived severity of threatening subjects
  catastrophize?: number; // amplifies perceived severity of negative deltas
}

export interface VoiceParams {
  register?: string;   // vocabulary register, e.g. "plain, working-class"
  rhythm?: string;      // sentence rhythm, e.g. "short, clipped"
  images?: string[];    // characteristic images/metaphors this voice reaches for
}

/** Mirrors DayaAffect's shape (services/daya-affect.ts) without importing
 * Prisma into a DB-free math module. */
export interface AffectVector {
  morale: number; // -1..1
  stress: number; // 0..1
  grief: number;  // 0..1
}

// ── Tunables (Phase 1 defaults — exposed, not hardcoded) ───────────────

export const RENDERER_TUNING = {
  /** How strongly current mood tilts phrasing emphasis within an honest
   * fidelity band. Spec §3 default 0.5; T0 digest may revise. */
  moodTiltGain: 0.5,
};

/** Subject-type attunement caps (Ruling 12, §2). `possession` is not
 * specified in the source design — treated as environment-tier (0.8) since
 * a possession is a physically inspectable object; flagged for review. */
export const SUBJECT_ATTUNEMENT_CAPS: Record<RenderSubject, number> = {
  'self-stat': 1,
  'possession': 0.8,
  'environment': 0.8,
  'other-entity': 0.6,
  'relationship': 0.5,
};

// ── Seeded PRNG (mulberry32 fed by an FNV-1a hash) ──────────────────────

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic seed for (entityId, subjectKey, revisionEpoch) — a believed
 * value must not jitter between consecutive queries at the same epoch. */
export function seedFor(entityId: string, subjectKey: string, revisionEpoch: number): number {
  return fnv1a(`${entityId}|${subjectKey}|${revisionEpoch}`);
}

export function rngFor(entityId: string, subjectKey: string, revisionEpoch: number): () => number {
  return mulberry32(seedFor(entityId, subjectKey, revisionEpoch));
}

// ── Fidelity ladder (F0-F5) ──────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/**
 * Fidelity level = floor(attunement * 5), capped per subject type, with the
 * F5 seal gated hard at attunement >= 0.95 (deep-introspection endgame
 * only — Phase 1 Violet's introspection sits in [0.4, 0.6), so she never
 * reaches past F2 self-view).
 */
export function computeFidelityLevel(subject: RenderSubject, attunement: number): number {
  const capped = Math.min(clamp01(attunement), SUBJECT_ATTUNEMENT_CAPS[subject]);
  if (capped >= 0.95) return 5;
  return Math.min(4, Math.floor(capped * 5));
}

// ── Mood ─────────────────────────────────────────────────────────────────

/** Single -1..1 valence proxy off the three DayaAffect drives — positive is
 * good, negative is bad. */
export function moodValence(mood: AffectVector): number {
  return clamp(mood.morale - mood.stress * 0.5 - mood.grief * 0.5, -1, 1);
}

// ── Seal lint (Ruling 13 — mechanical vocabulary must never reach the
// entity's phenomenal stream) ───────────────────────────────────────────

// Two alternatives at the top level (not sharing one leading \b): a bare
// mechanics-vocabulary word list, and a signed-number-attached-to-attribute
// pattern. \b does not match between two non-word characters (e.g. a space
// and a leading "-"), so the signed-number branch cannot share the bare
// words' leading \b — it only needs a trailing \b after the attribute name.
export const SEAL_LINT_REGEX =
  /\b(roll|DR|pool|KRMA|modifier|tier|d(?:4|6|8|10|12|20))\b|[+-]\d+\s+(?:Willpower|Wit|Wisdom|Clout|Celerity|Constitution|Focus|Frequency|Flow)\b/i;

export function sealLint(text: string): { ok: boolean; match: string | null } {
  const m = SEAL_LINT_REGEX.exec(text);
  return { ok: m === null, match: m ? m[0] : null };
}

// ── Bias application (§4) ────────────────────────────────────────────────

function signStr(v: number): string {
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

/**
 * Applies the five distortion operators to a true fraction (0..1) BEFORE
 * fidelity noise, per subject-type applicability:
 *   - selfRegard: self-stat only (own-competence reads)
 *   - optimism: everything except self-stat (world/other reads)
 *   - projection: other-entity only, contaminated by the observer's own mood
 *   - denial / catastrophize: general severity dampen/amplify, either subject
 * Logs a human-readable audit tag per firing into `distortions` (JEWL-only,
 * never rendered into prose).
 */
export function applyBiasToFraction(
  trueFraction: number,
  subject: RenderSubject,
  bias: BiasProfile,
  mood: AffectVector,
  distortions: string[],
): number {
  let f = trueFraction;

  if (subject === 'self-stat' && bias.selfRegard) {
    const err = bias.selfRegard * 0.3;
    f += err;
    distortions.push(`selfRegard:${signStr(bias.selfRegard)}→${err >= 0 ? 'overread' : 'underread'}`);
  }

  if (subject !== 'self-stat' && bias.optimism) {
    const err = bias.optimism * 0.3;
    f += err;
    distortions.push(`optimism:${signStr(bias.optimism)}→${err >= 0 ? 'rosier' : 'grimmer'}`);
  }

  if (subject === 'other-entity' && bias.projection) {
    // Own mood attributed to the other entity: negative observer valence
    // (grief/stress) reads the other as worse off; positive valence reads
    // them as better off. Same sign as observer mood, not inverted.
    const valence = moodValence(mood);
    const contamination = bias.projection * valence * 0.3;
    if (Math.abs(contamination) > 0.001) {
      f += contamination;
      distortions.push(`projection:${valence < 0 ? 'grief' : 'mood'}→other`);
    }
  }

  if (bias.denial) {
    const err = bias.denial * 0.25;
    f += err;
    distortions.push(`denial:${signStr(bias.denial)}→dampened`);
  }

  if (bias.catastrophize) {
    const err = -bias.catastrophize * 0.25;
    f += err;
    distortions.push(`catastrophize:${signStr(bias.catastrophize)}→amplified`);
  }

  return clamp(f, 0, 1.3);
}

// ── Fidelity noise (seeded, per-level error bands) ──────────────────────

export interface NoiseResult {
  fraction: number;
  distortion?: string;
}

/** Applies the per-level seeded error band on top of the bias-distorted
 * fraction. Level 5 is exact and bypassed by the caller before this runs. */
export function applyFidelityNoise(biasedFraction: number, level: number, rng: () => number): NoiseResult {
  switch (level) {
    case 0: {
      // Blind/wrong: no reliable signal — fabricate rather than anchor to truth.
      return { fraction: clamp01(rng()), distortion: 'F0:fabricated-or-blind' };
    }
    case 1:
    case 2: {
      // Vague-felt / relational: no magnitude carried, but a small seeded
      // jitter keeps a boundary read from staling identically forever.
      const jitter = (rng() * 2 - 1) * 0.05;
      return { fraction: clamp(biasedFraction + jitter, 0, 1.3) };
    }
    case 3: {
      const noise = (rng() * 2 - 1) * 0.2; // ±20%
      return { fraction: clamp(biasedFraction * (1 + noise), 0, 1.3) };
    }
    case 4: {
      const noise = (rng() * 2 - 1) * 0.05; // ±5%
      return { fraction: clamp(biasedFraction * (1 + noise), 0, 1.3) };
    }
    default:
      return { fraction: clamp01(biasedFraction) };
  }
}

// ── Ordinal / fraction-word content ladder (numeric stats) ─────────────

interface OrdinalBucket { min: number; label: string }
const F1_BUCKETS: OrdinalBucket[] = [
  { min: 0.75, label: 'plenty' },
  { min: 0.4, label: 'enough' },
  { min: 0.15, label: 'running low' },
  { min: -Infinity, label: 'empty' },
];
const F2_BUCKETS: OrdinalBucket[] = [
  { min: 0.75, label: 'plenty — could keep this up for hours' },
  { min: 0.5, label: 'enough to keep going a good while at this rate' },
  { min: 0.25, label: 'getting thin — maybe another hour like this' },
  { min: -Infinity, label: 'nearly spent, running on fumes' },
];

function pickBucket(buckets: OrdinalBucket[], fraction: number): string {
  return (buckets.find(b => fraction >= b.min) ?? buckets[buckets.length - 1]).label;
}

interface FractionWord { frac: number; remaining: string; spent: string }
const FRACTION_WORDS: FractionWord[] = [
  { frac: 0, remaining: 'nothing', spent: 'everything' },
  { frac: 0.25, remaining: 'about a quarter', spent: 'about three-quarters' },
  { frac: 1 / 3, remaining: 'about a third', spent: 'about two-thirds' },
  { frac: 0.5, remaining: 'about half', spent: 'about half' },
  { frac: 2 / 3, remaining: 'about two-thirds', spent: 'about a third' },
  { frac: 0.75, remaining: 'about three-quarters', spent: 'about a quarter' },
  { frac: 1, remaining: 'all', spent: 'nothing' },
];

function nearestFractionWord(fraction: number): FractionWord {
  let best = FRACTION_WORDS[0];
  let bestDiff = Infinity;
  for (const fw of FRACTION_WORDS) {
    const diff = Math.abs(fw.frac - fraction);
    if (diff < bestDiff) { bestDiff = diff; best = fw; }
  }
  return best;
}

/** Mood tilts *phrasing emphasis* within the honest fidelity band — never
 * the underlying fraction (spec §3: "two-thirds left" vs "already a third
 * gone" is the same number, opposite framing). */
function moodTiltsPessimistic(mood: AffectVector, gain: number): boolean {
  return moodValence(mood) * gain < -0.15;
}
function moodTiltsOptimistic(mood: AffectVector, gain: number): boolean {
  return moodValence(mood) * gain > 0.15;
}

function humanLabel(subjectKey: string): string {
  const last = subjectKey.split('.').pop() ?? subjectKey;
  return last.replace(/[_-]/g, ' ');
}

// ── Numeric stat content ─────────────────────────────────────────────────

export interface NumericStat { current: number; max: number }

export function isNumericStat(data: unknown): data is NumericStat {
  return (
    typeof data === 'object' && data !== null &&
    typeof (data as Record<string, unknown>).current === 'number' &&
    typeof (data as Record<string, unknown>).max === 'number'
  );
}

export interface ContentResult {
  fraction: number;          // final distorted fraction (0..1.3), post-bias + post-noise
  numericEstimate: number;   // fraction * max — the value the revision loop stores
  prose: string;             // deterministic template rendering of this content (fallback + envelope anchor)
  distortions: string[];
}

/**
 * Computes the distorted content for a numeric (current/max) stat at a
 * given fidelity level, applying bias operators then fidelity noise, then
 * rendering the deterministic fallback prose for that level. This is both
 * (a) the ultimate fail-local fallback if voicing fails twice, and (b) the
 * "allowed content" envelope the L1 voicing call is anchored to.
 */
export function computeNumericContent(
  req: { subject: RenderSubject; subjectKey: string; trueData: NumericStat; context?: string },
  bias: BiasProfile,
  mood: AffectVector,
  level: number,
  rng: () => number,
  moodTiltGain: number = RENDERER_TUNING.moodTiltGain,
): ContentResult {
  const distortions: string[] = [];
  const trueFraction = req.trueData.max > 0 ? clamp01(req.trueData.current / req.trueData.max) : 0;
  const label = humanLabel(req.subjectKey);

  if (level >= 5) {
    // F5 — deep introspection: exact, bias-free, felt self-knowledge.
    return {
      fraction: trueFraction,
      numericEstimate: req.trueData.current,
      prose: `${capitalize(label)} ${req.trueData.current}/${req.trueData.max}.`,
      distortions,
    };
  }

  const biased = applyBiasToFraction(trueFraction, req.subject, bias, mood, distortions);
  const { fraction: noisy, distortion } = applyFidelityNoise(biased, level, rng);
  if (distortion) distortions.push(distortion);

  const pessimistic = moodTiltsPessimistic(mood, moodTiltGain);
  const optimistic = moodTiltsOptimistic(mood, moodTiltGain);
  if (pessimistic) distortions.push('moodTilt:pessimistic');
  else if (optimistic) distortions.push('moodTilt:optimistic');

  let prose: string;
  const numericEstimate = clamp01(noisy) * req.trueData.max;

  if (level === 0) {
    const blindLines = pessimistic
      ? [`Something feels wrong with your ${label}, though you can't place it.`, `You feel spent — or maybe you don't. Hard to say.`]
      : optimistic
        ? [`You feel fine.`, `Your ${label} feels solid enough.`]
        : [`You feel fine.`, `Hard to tell how your ${label} really stands right now.`];
    prose = blindLines[Math.floor(rng() * blindLines.length) % blindLines.length];
  } else if (level === 1) {
    let bucketFraction = noisy;
    // optimism/denial can flip the ordinal category near a boundary at F0-F2.
    if (optimistic) bucketFraction += 0.05;
    if (pessimistic) bucketFraction -= 0.05;
    prose = `You have ${pickBucket(F1_BUCKETS, bucketFraction)}.`;
  } else if (level === 2) {
    let bucketFraction = noisy;
    if (optimistic) bucketFraction += 0.05;
    if (pessimistic) bucketFraction -= 0.05;
    prose = `${capitalize(pickBucket(F2_BUCKETS, bucketFraction))}.`;
  } else {
    // F3/F4 — fraction-word content, mood colors "remaining" vs "spent" framing.
    const fw = nearestFractionWord(clamp01(noisy));
    const framing = pessimistic ? fw.spent : fw.remaining;
    const framingVerb = pessimistic ? 'is already gone' : 'left of what you had this morning';
    if (level === 3) {
      prose = `Maybe ${framing} ${pessimistic ? framingVerb : framingVerb}.`;
    } else {
      const roundedEstimate = Math.round(numericEstimate);
      prose = `${roundedEstimate}-ish out of what feels like ${req.trueData.max}.`;
    }
  }

  return { fraction: noisy, numericEstimate, prose, distortions };
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// ── Descriptive (non-numeric) content — environment/possession/relationship
// facts and other-entity impressions that aren't a current/max pool ──────

export function computeDescriptiveContent(
  req: { subject: RenderSubject; subjectKey: string; trueData: unknown; context?: string },
  bias: BiasProfile,
  mood: AffectVector,
  level: number,
  rng: () => number,
): ContentResult {
  const distortions: string[] = [];
  const raw = typeof req.trueData === 'string' ? req.trueData : JSON.stringify(req.trueData);
  const pessimistic = moodTiltsPessimistic(mood, RENDERER_TUNING.moodTiltGain);
  const optimistic = moodTiltsOptimistic(mood, RENDERER_TUNING.moodTiltGain);
  if (pessimistic) distortions.push('moodTilt:pessimistic');
  else if (optimistic) distortions.push('moodTilt:optimistic');

  // optimism/projection/denial/catastrophize still fire as directional log
  // entries even though a raw fact has no fraction to bend numerically —
  // the coloring shows up in which template variant is chosen below.
  const colorBias = (bias.optimism ?? 0) - (bias.catastrophize ?? 0) * 0.5 + (bias.denial ?? 0) * 0.3;
  if (req.subject === 'other-entity' && bias.projection) {
    const valence = moodValence(mood);
    if (Math.abs(bias.projection * valence) > 0.05) {
      distortions.push(`projection:${valence < 0 ? 'grief' : 'mood'}→other`);
    }
  }
  if (bias.denial) distortions.push(`denial:${signStr(bias.denial)}→dampened`);
  if (bias.catastrophize) distortions.push(`catastrophize:${signStr(bias.catastrophize)}→amplified`);

  const grim = colorBias < -0.1 || pessimistic;
  const rosy = colorBias > 0.1 || optimistic;

  let prose: string;
  switch (level) {
    case 0:
      prose = rng() < 0.5 ? "You can't quite tell." : 'Something is there, but you cannot place what.';
      break;
    case 1:
      prose = grim ? 'You get a vague, uneasy sense of it.' : rosy ? 'You get a vague, reassuring sense of it.' : 'You get only a vague sense of it.';
      break;
    case 2:
      prose = 'You can make out roughly what is going on, though the details stay fuzzy.';
      break;
    case 3:
      prose = 'You get a fairly clear read on it, missing a few specifics.';
      break;
    case 4:
      prose = 'You can make out nearly everything about it, just a little uncertain at the edges.';
      break;
    default:
      prose = raw;
  }

  return { fraction: level >= 5 ? 1 : 0.5, numericEstimate: level >= 5 ? 1 : 0, prose, distortions };
}
