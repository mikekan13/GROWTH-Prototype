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

// ── Injectable transports (production: real network; tests: fakes) ────────

export interface DayaFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}
export type DayaFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
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
      system?: string;
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    }) => Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export interface DayaClientOverrides {
  fetchImpl?: DayaFetch;
  anthropicClient?: AnthropicLike;
}

// ── Pricing (WP2b will ratify real figures — placeholder estimates) ───────

const DEFAULT_C_MODEL = 'claude-sonnet-4-6';

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

/** Which tiers are currently configured — used by tests + the JEWL
 * observation surface (WP11) to report tier health without attempting a call. */
export function tierAvailability(): Record<DayaTier, boolean> {
  return {
    L1: !!(process.env.DAYA_L1_URL && process.env.DAYA_L1_MODEL),
    L2: !!(process.env.DAYA_L2_URL && process.env.DAYA_L2_MODEL),
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

async function callOpenAiCompatible(
  tier: 'L1' | 'L2',
  params: DayaChatParams,
  fetchImpl: DayaFetch,
): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
  const { url, model: tierModel } = resolveOpenAiTierConfig(tier);
  const model = params.model || tierModel;

  const requestBody: Record<string, unknown> = {
    model,
    messages: params.messages,
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

  const res = await fetchImpl(`${url.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
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
): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
  if (!client && !process.env.ANTHROPIC_API_KEY) {
    throw new DayaTierUnavailableError('C', 'ANTHROPIC_API_KEY not configured');
  }
  const anthropic: AnthropicLike = client ?? (new Anthropic() as unknown as AnthropicLike);
  const model = params.model || process.env.DAYA_C_MODEL || DEFAULT_C_MODEL;

  const system = params.messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const nonSystem = params.messages
    .filter((m): m is { role: 'user' | 'assistant'; content: string } => m.role !== 'system');

  const response = await anthropic.messages.create({
    model,
    max_tokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.7,
    system: system || undefined,
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

  const { text, tokensIn, tokensOut, model } =
    params.tier === 'C'
      ? await callAnthropic(params, overrides.anthropicClient)
      : await callOpenAiCompatible(params.tier, params, fetchImpl);

  const usd = estimateUsd(model, tokensIn, tokensOut);

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
