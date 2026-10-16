/**
 * ai/network — shared types for the model-routing layer.
 *
 * The network layer is the ONE chokepoint every AI call passes through.
 * Design authority: AI-NETWORK-DESIGN-INTENT-2026-08-23.md —
 *   - ATTRIBUTION INSIDE, ANONYMITY OUTSIDE: the wall is where processing
 *     happens. LOCAL = company-controlled compute (our serverless workers);
 *     CLOUD = third-party model APIs, reached only through the sanitize seam.
 *   - Division of cognition (Mike 2026-08-23): the game runtime (rules,
 *     canvas driving, orchestration) targets the LOCAL lane; Claude carries
 *     episodic heavy cognition (simulation, psychology profiling, Godhead
 *     balance, company decisions) — and, during the dev era, stands in for
 *     lanes the local model hasn't taken over yet.
 */

/** Which lane a task runs on. */
export type LaneName =
  | 'judgment'   // JEWL tool-loop + godhead reasoning — Claude Sonnet tier
  | 'classify'   // cheap yes/no gates (ambient classifier) — Haiku tier
  | 'grunt'      // work-cycle chores: memory seeding, summaries — Haiku tier
  | 'local'      // company-controlled open model (serverless vLLM)
  | 'godhead';   // deep-reasoning text (blueprint authoring etc.) — Claude

export type ProviderKind = 'anthropic' | 'openai-compat' | 'ollama';

/**
 * Content class of what a task carries — THE wall's vocabulary
 * (Mike 2026-10-12: cloud = the Soul pillar, heavy reasoning; local = the
 * Spirit pillar, the live table and the gatekeeper).
 *   fiction — backstory, memories, scenes, in-character speech, drafts.
 *             MAY reach a cloud lane, through enforceWall + toneFilter.
 *   table   — ambient mic transcript, out-of-character chatter. NEVER cloud.
 *   real    — anything about the actual humans. NEVER cloud.
 * There is no "trusted" bypass class: every task declares one of these.
 */
export type ContentClass = 'fiction' | 'table' | 'real';

/** True when content of this class may cross the wall to a cloud transport. */
export function mayCrossWall(c: ContentClass): boolean {
  return c === 'fiction';
}

/** What a call site declares about the work it wants done. */
export interface TaskDescriptor {
  /** Stable caller id for metering/traces, e.g. 'jewl-dispatch'. */
  caller: string;
  /** Lane request. Callers usually name the lane directly; route() may
   *  override based on flags/content class (never silently downgrading the wall). */
  lane: LaneName;
  campaignId?: string;
  /** Content maturity flags (forge vocab) — AUDIENCE control that rides on
   *  traces. Never a routing signal (Mike 2026-10-16: "Mental health
   *  shouldn't be flagging our internals"). */
  maturityFlags?: string[];
  /** REQUIRED: what the payload is. table/real never leave the wall. */
  contentClass: ContentClass;
}

/** A resolved lane: which model on which transport, with lane options. */
export interface ResolvedLane {
  lane: LaneName;
  provider: ProviderKind;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  /** True when this transport leaves company-controlled compute. */
  crossesWall: boolean;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const EMPTY_USAGE: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};
