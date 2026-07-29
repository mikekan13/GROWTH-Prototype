/**
 * DAYA recall tunables — persona harness memory layer.
 *
 * Single source of truth for every numeric knob the ingest + recall pipeline
 * uses. Values are the FINAL calibrated set (psych-digest sourced where
 * marked below), not provisionals — see recall.ts for how each is applied.
 * Kept in its own leaf module (no imports from memory.ts or recall.ts) so
 * both can depend on it without a cycle.
 */
export const RECALL_TUNING = {
  // Candidate gate — Wisdom breadth (§4)
  thetaBase: 0.45,
  thetaReach: 0.35,
  wisdomBreadthFactor: 0.35, // theta = thetaBase * (1 - 0.35 * wisdomNorm)
  wisdomBudgetGain: 3, // budget n = 1 + round(3 * wisdomNorm)
  wisdomNormDivisor: 40, // Ruling 23 calibration: 30-40 human
  wisdomNormCap: 1.2,
  currentPoolNarrowFloor: 0.4, // drained current-pool never narrows budget below 40%

  // Wit — surfacing speed (§4)
  witImmediateBase: 0.4,
  witImmediateGain: 0.5,

  // Scoring weights (§3 / §6)
  wRel: 0.45,
  wRec: 0.2,
  wSal: 0.2,
  wMood: 0.15,

  // Recency power-law decay (T0 §A/§E)
  decayExp: 0.5, // r
  salienceDecayResistFactor: 0.5,

  // Mood congruence (T0 §B/§E)
  moodGainPositive: 0.25,
  moodGainNegative: 0.15,
  moodRepairBias: 0.1, // applies when morale < -0.3 and no rumination lock
  stressThreatSharpen: 0.15, // threat-tagged only

  // Encode-time salience amplification by arousal (T0 §B/§E)
  encodeArousalSalienceMul: 0.4,

  // Rehearsal (§3 / T0 §A/§E)
  rehearsalBoost: 0.05,
  rehearsalBoostCap: 1.0,
} as const;
