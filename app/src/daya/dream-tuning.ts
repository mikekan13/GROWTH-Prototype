/**
 * DAYA dream-consolidation tunables — the FINAL calibrated values from the
 * psych-science digest (T0-PARAM-MAP §E, DREAM_TUNING block), not
 * provisionals. Kept in its own leaf module (no imports from dream.ts,
 * scheduler.ts, or recall.ts) so every one of them can depend on it without
 * an import cycle — same discipline as recall-tuning.ts for WP4.
 */
export const DREAM_TUNING = {
  /** Modest per-tick salience gain from a dream touch — consolidation is
   * cumulative over many ticks, never one-shot (NREM-gated TMR effect is
   * real but small-moderate). */
  perTickSalienceGain: 0.08,
  /** Hard ceiling on |Δ valence| / |Δ arousal| / |Δ salience| any single
   * dream tick may apply to one memory, before the age-gradient scaling. */
  perTickDriftCap: 0.15,
  /** Reconsolidation lability has an age gradient (Milekic & Alberini 2002):
   * distortability = (1 + ageCycles)^(-reconsolidationAgeExp). Young
   * memories retag freely; old ones barely move. */
  reconsolidationAgeExp: 0.5,
  /** Spacing effect: rehearsal credit is multiplied by (1 - this) when the
   * memory was ALSO touched on the immediately preceding dream tick —
   * clustered rehearsal compounds salience less than spaced rehearsal. */
  recentlyRehearsedPenalty: 0.6,
  /** Dream consolidation is permitted to synthesize gist-fidelity
   * meta-memories (memories-of-memories, Ruling 6) rather than only ever
   * replaying verbatim content. */
  gistSynthesisEnabled: true,
  /** Weight added to a negative/high-arousal cluster's selection score so
   * rumination-locked subjects get preferentially re-selected tick over
   * tick — the reconsolidation-strengthening loop that IS the trauma
   * mechanism (T0 §C). */
  ruminationReselectBias: 0.5,
  /** Per-pass valence deepening applied to a rumination-locked cluster's
   * members (negative — deepens toward more negative). */
  ruminationValenceStep: -0.06,
  /** Per-pass arousal deepening applied to a rumination-locked cluster's
   * members (positive — deepens toward more aroused/threat-activated). */
  ruminationArousalStep: 0.04,
  /** Magnitude of valence movement TOWARD NEUTRAL applied when the
   * two-event reconsolidation-healing requirement is met (reactivation +
   * counterweight, both present). Negative because it always moves the
   * (negative) locked valence up toward zero. */
  reconsolidationHeal: -0.08,
  /** Probability a present counterweight breaks an active rumination lock
   * on the tick it's detected — non-deterministic, environment-dependent
   * course for a scar (T0 §C), driven by a seeded PRNG so runs stay
   * reproducible. */
  counterweightBreakP: 0.4,
  /** Per-tick erosion of a suppressed (Thorn-proposed) cluster's
   * suppression strength when it is NOT reactivated — extinction is not
   * erasure; the memory can resurface later once suppression decays out. */
  suppressionDecayPerTick: 0.1,
} as const;
