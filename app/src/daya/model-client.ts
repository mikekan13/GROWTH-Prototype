/**
 * DayaModelClient — the ONE uniform interface every DAYA subsystem (the
 * persona harness beneath AI-controlled character sheets) calls through to
 * reach a model, at any tier:
 *   L1 — self-hosted vLLM persona core (OpenAI-compatible chat completions)
 *   L2 — self-hosted secondary tier, same shape, may be unconfigured
 *   C  — cloud (Anthropic) — reuses the credentials the godhead agent
 *        runtime already relies on (see src/godhead/agent.ts)
 *
 * Every call writes a DayaModelCall metering row (tokens, $, subsystem tag)
 * before returning — cost/token accounting can never be bypassed by calling
 * a provider SDK directly instead of this client. A tier with missing
 * configuration throws DayaTierUnavailableError; this client never silently
 * falls back to a different tier.
 */
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { recordAiCall } from '@/ai/network';

export type DayaTier = 'L1' | 'L2' | 'C';

export interface DayaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DayaChatParams {
  tier: DayaTier;
  subsystem: string;   // which DAYA subsystem is calling (tagger, adjudicator, dream, ...)
  entityId?: string;   // DayaEntity id this call is on behalf of, if any
  messages: DayaChatMessage[];
  maxTokens?: number;
  temperature?: number;
  rationale?: string;  // audit trail for routing/sanitization decisions (Addendum A2)
  sanitized?: boolean; // true once this payload has passed the sanitization boundary (WP6)
  /** Per-call override of the tier's default model — C-tier: passed straight
   * through as the Anthropic model; L1/L2: overrides DAYA_*_MODEL for this
   * call only. Absent = tier's env-configured default, unchanged. This is
   * what lets a caller (router.ts's within-C ladder pick) select a model
   * without mutating process.env, which would race under concurrent calls
   * resolving to different models at once. */
  model?: string;
}

export interface DayaChatResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export class DayaTierUnavailableError extends AppError {
  constructor(tier: DayaTier, detail: string) {
    super(`DAYA tier ${tier} unavailable: ${detail}`, 503);
    this.name = 'DayaTierUnavailableError';
  }
}

/**
 * WP14 — thrown when an L1/L2 call is aborted by our own request timeout
 * (DAYA_{tier}_TIMEOUT_MS) rather than a hard connection failure. On a
 * serverless-billed L1 (scale-to-zero), the first request of a session can
 * be slow while a worker spins up — this is NOT "the endpoint is down"
 * (DayaTierUnavailableError), it's "still reachable, just not answered
 * yet." Callers (conversation.ts) use this distinction to surface a
 * 'warming' state instead of 'core_offline'.
 */
export class DayaWarmingTimeoutError extends AppError {
  constructor(
    public readonly tier: DayaTier,
    public readonly timeoutMs: number,
  ) {
    super(`DAYA tier ${tier} timed out after ${timeoutMs}ms — likely still warming up from a cold start`, 504);
    this.name = 'DayaWarmingTimeoutError';
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message));
}

// ── Injectable transports (production: real network; tests: fakes) ────────

export interface DayaFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}
export type DayaFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<DayaFetchResponse>;

/** Minimal shape of the Anthropic client this module needs — decoupled from
 * the full SDK type so tests can inject a plain fake without fighting the
 * SDK's overloaded streaming/non-streaming signatures. */
export interface AnthropicLike {
  messages: {
    create: (params: {
      model: string;
      max_tokens: number;
      temperature?: number;
      system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }) => Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    }>;
  };
}

export interface DayaClientOverrides {
  fetchImpl?: DayaFetch;
  anthropicClient?: AnthropicLike;
}

// ── Pricing (WP2b will ratify real figures — placeholder estimates) ───────

const DEFAULT_C_MODEL = 'claude-sonnet-4-6';

/** WP14 — generous default so a serverless-billed L1/L2 cold start (worker
 * scale-from-zero, ~2-3 min) doesn't get aborted mid-spin-up. Override per
 * tier via DAYA_L1_TIMEOUT_MS / DAYA_L2_TIMEOUT_MS. */
const DEFAULT_TIER_TIMEOUT_MS = 240_000;

/** $ per 1M tokens, in/out. L1/L2 are self-hosted — compute cost, not
 * tracked per-token here; unknown models estimate $0 rather than guess. */
const PRICE_TABLE_PER_MILLION: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-4-6': { in: 15, out: 75 },
  'claude-haiku-4-6': { in: 0.8, out: 4 },
};

function estimateUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = PRICE_TABLE_PER_MILLION[model];
  if (!price) return 0;
  return (tokensIn / 1_000_000) * price.in + (tokensOut / 1_000_000) * price.out;
}

// ── Tier registry ───────────────────────────────────────────────────────────

export type DayaTierProvider = 'openai' | 'anthropic';

/** Transport provider for a persona tier (L1/L2). 'anthropic' runs the
 * tier over the Claude API instead of a self-hosted endpoint (dev /
 * cost-saving mode — the pod stays parked). Routing, clamping, and
 * metering are unchanged: the tier keeps its meaning everywhere; only the
 * transport differs. Set DAYA_L1_PROVIDER=anthropic to enable. */
export function tierProvider(tier: 'L1' | 'L2'): DayaTierProvider {
  return process.env[`DAYA_${tier}_PROVIDER`] === 'anthropic' ? 'anthropic' : 'openai';
}

/** Model used when a persona tier is Claude-backed: per-tier override,
 * else the C-tier default chain. */
function anthropicModelForTier(tier: DayaTier, explicit?: string): string {
  if (explicit) return explicit;
  if (tier !== 'C') {
    const perTier = process.env[`DAYA_${tier}_ANTHROPIC_MODEL`];
    if (perTier) return perTier;
  }
  return process.env.DAYA_C_MODEL || DEFAULT_C_MODEL;
}

/** Which tiers are currently configured — used by tests + the JEWL
 * observation surface (WP11) to report tier health without attempting a call. */
export function tierAvailability(): Record<DayaTier, boolean> {
  return {
    L1: tierProvider('L1') === 'anthropic'
      ? !!process.env.ANTHROPIC_API_KEY
      : !!(process.env.DAYA_L1_URL && process.env.DAYA_L1_MODEL),
    L2: tierProvider('L2') === 'anthropic'
      ? !!process.env.ANTHROPIC_API_KEY
      : !!(process.env.DAYA_L2_URL && process.env.DAYA_L2_MODEL),
    C: !!process.env.ANTHROPIC_API_KEY,
  };
}

function resolveOpenAiTierConfig(tier: 'L1' | 'L2'): { url: string; model: string } {
  const url = process.env[`DAYA_${tier}_URL`];
  const model = process.env[`DAYA_${tier}_MODEL`];
  if (!url || !model) {
    throw new DayaTierUnavailableError(tier, `DAYA_${tier}_URL / DAYA_${tier}_MODEL not configured`);
  }
  return { url, model };
}

/**
 * Exported (WP14) so its auth-header + timeout behavior can be unit-tested
 * directly against an injected fetchImpl, without going through chat()'s
 * prisma.dayaModelCall.create() write — keeps these tests DB-free, matching
 * this project's vitest convention (see vitest.config.ts). Production
 * callers still go through chat(), which meters every call; this is not a
 * second entry point for real traffic.
 */
export async function callOpenAiCompatible(
  tier: 'L1' | 'L2',
  params: DayaChatParams,
  fetchImpl: DayaFetch,
): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
  const { url, model: tierModel } = resolveOpenAiTierConfig(tier);
  const model = params.model || tierModel;

  // vLLM/Qwen chat templates cannot render a conversation with no
  // user/assistant turn — a system-only message list 500s opaquely through
  // the RunPod proxy (found 2026-08-30, A/B verified). The harness composes
  // single system-blob prompts; normalize by demoting to a user turn
  // (single) or folding the tail into one (multiple). No text is added —
  // instruction-following is equivalent from the user role here.
  let messages = params.messages;
  if (!messages.some(m => m.role !== 'system')) {
    messages = messages.length === 1
      ? [{ ...messages[0], role: 'user' as const }]
      : [messages[0], { role: 'user' as const, content: messages.slice(1).map(m => m.content).join('\n\n') }];
  }

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    max_tokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.7,
  };

  // The self-hosted persona core (Qwen3.6-class) ships with an interleaved
  // reasoning mode that emits chain-of-thought ("Here's a thinking process:")
  // into the message content. DAYA's own interior monologue is prompted
  // content, not the model's reasoning trace — the trace must never reach an
  // entity's phenomenal stream. Suppress it via the chat template unless
  // explicitly re-enabled. Harmless for models whose template ignores the kwarg.
  if (process.env.DAYA_DISABLE_THINKING !== 'false') {
    requestBody.chat_template_kwargs = { enable_thinking: false };
  }

  // WP14 — RunPod serverless (and other cold-start-billed hosts) gate the
  // OpenAI-compatible endpoint behind a bearer token; the current
  // always-on pod has none configured, so absent = unchanged (no header).
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Fallback chain matches ai/network/config localLane(): tier-specific
  // key first, then the shared local-lane / RunPod keys (2026-08-29 — the
  // serverless endpoint 401'd because only DAYA_L1_API_KEY was consulted).
  const apiKey = process.env[`DAYA_${tier}_API_KEY`]
    ?? process.env.AI_LOCAL_API_KEY
    ?? process.env.RUNPOD_API_KEY;
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  // WP14 — generous, env-configurable timeout so a cold start (worker
  // spinning up from zero) doesn't get treated as a hard failure. An abort
  // here throws the typed DayaWarmingTimeoutError, distinguishable from a
  // real connection/HTTP failure, so callers can surface "still waking up"
  // instead of "offline."
  const timeoutMs = Number(process.env[`DAYA_${tier}_TIMEOUT_MS`] ?? DEFAULT_TIER_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: DayaFetchResponse;
  try {
    res = await fetchImpl(`${url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
  } catch (err) {
    if (isAbortError(err)) {
      throw new DayaWarmingTimeoutError(tier, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    // Diagnostic breadcrumb (2026-08-30): the RunPod proxy masks vLLM
    // errors as opaque 500s — log what we actually sent so shape bugs
    // (overlong prompts, bad model names, odd roles) are visible.
    const chars = JSON.stringify(requestBody).length;
    // eslint-disable-next-line no-console
    console.error(
      `[daya/model-client] ${tier} ${res.status} — model=${model} messages=${params.messages.length} bodyChars=${chars} maxTokens=${requestBody.max_tokens} roles=${params.messages.map(m => m.role).join(',').slice(0, 120)}`,
    );
    throw new AppError(`DAYA ${tier} endpoint returned ${res.status}: ${detail}`, 502);
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: body.choices?.[0]?.message?.content ?? '',
    tokensIn: body.usage?.prompt_tokens ?? 0,
    tokensOut: body.usage?.completion_tokens ?? 0,
    model,
  };
}

async function callAnthropic(
  params: DayaChatParams,
  client: AnthropicLike | undefined,
): Promise<{ text: string; tokensIn: number; tokensOut: number; cacheRead: number; cacheWrite: number; model: string }> {
  if (!client && !process.env.ANTHROPIC_API_KEY) {
    throw new DayaTierUnavailableError(params.tier, 'ANTHROPIC_API_KEY not configured');
  }
  const anthropic: AnthropicLike = client ?? (new Anthropic() as unknown as AnthropicLike);
  const model = anthropicModelForTier(params.tier, params.model);

  const system = params.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const nonSystem = params.messages
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => m.role !== 'system');

  const response = await anthropic.messages.create({
    model,
    max_tokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.7,
    // Prompt caching (2026-08-23 network build): DAYA's Claude consults were
    // the one path still paying full price for stable system prefixes.
    system: system
      ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
      : undefined,
    messages: nonSystem,
  });

  const text = response.content
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('\n');

  return {
    text,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    model,
  };
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * The one entry point every DAYA subsystem uses to reach a model. Writes a
 * DayaModelCall metering row before returning. Throws DayaTierUnavailableError
 * for a tier that isn't configured — never falls back to a different tier.
 */
export async function chat(
  params: DayaChatParams,
  overrides: DayaClientOverrides = {},
): Promise<DayaChatResult> {
  const fetchImpl: DayaFetch = overrides.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<DayaFetchResponse>);

  const viaAnthropic = params.tier === 'C' || tierProvider(params.tier) === 'anthropic';
  const { text, tokensIn, tokensOut, model, ...cacheStats } = viaAnthropic
    ? await callAnthropic(params, overrides.anthropicClient)
    : { ...(await callOpenAiCompatible(params.tier as 'L1' | 'L2', params, fetchImpl)), cacheRead: 0, cacheWrite: 0 };
  const cacheRead = cacheStats.cacheRead ?? 0;
  const cacheWrite = cacheStats.cacheWrite ?? 0;

  const usd = estimateUsd(model, tokensIn, tokensOut);

  // Unified ai/network ledger — cache columns + lane rollup that the
  // DAYA-local DayaModelCall table lacks. Fire-and-forget.
  recordAiCall({
    lane: `daya-${params.tier.toLowerCase()}`,
    provider: viaAnthropic ? 'anthropic' : 'openai-compat',
    model,
    caller: `daya:${params.subsystem}`,
    usage: { inputTokens: tokensIn, outputTokens: tokensOut, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite },
    sanitized: params.sanitized ?? false,
  });

  await prisma.dayaModelCall.create({
    data: {
      entityId: params.entityId,
      subsystem: params.subsystem,
      tier: params.tier,
      model,
      tokensIn,
      tokensOut,
      usd,
      krma: 0,
      sanitized: params.sanitized ?? false,
      rationale: params.rationale,
    },
  });

  return { text, tokensIn, tokensOut };
}
