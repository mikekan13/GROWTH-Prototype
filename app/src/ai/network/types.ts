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

/** Privacy class of the content a task carries. Drives the sanitize seam. */
export type PrivacyClass =
  | 'trusted-dev'  // Mike's own dev-era content — no strip (his ruling:
                   // JEWL has Claude; the boundary is player-sensitive DATA)
  | 'safe'         // classified safe to forward as-is
  | 'sensitive';   // must NOT reach a cloud transport un-stripped

/** What a call site declares about the work it wants done. */
export interface TaskDescriptor {
  /** Stable caller id for metering/traces, e.g. 'jewl-dispatch'. */
  caller: string;
  /** Lane request. Callers usually name the lane directly; route() may
   *  override based on flags/privacy (never silently downgrading privacy). */
  lane: LaneName;
  campaignId?: string;
  /** Content maturity flags (forge vocab) — a routing signal: flagged
   *  generation prefers the local lane when it is live. */
  maturityFlags?: string[];
  privacy?: PrivacyClass;
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
