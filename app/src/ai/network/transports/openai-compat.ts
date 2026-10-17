/**
 * ai/network/transports/openai-compat — the LOCAL lane transport.
 *
 * Speaks the OpenAI chat-completions dialect, which covers every shape the
 * local lane takes: RunPod serverless vLLM (base = .../v2/<endpoint>/openai/v1),
 * a dev vLLM pod, or any other OpenAI-compatible server. This lane runs on
 * company-controlled compute — it is the inner face of the wall.
 */

import { assertGpuBudget } from '@/services/gpu-budget';
import 'server-only';
import type { AiUsage } from '../types';
import { LocalLaneError } from '@/lib/errors';
import {
  isRetryableLocalFailure,
  localMaxModelLen,
  logLocalPlan,
  LOCAL_LANE_USER_MESSAGE,
  planLocalRequest,
  upstreamErrorMessage,
  type LocalContentPart,
} from '../local-window';

export type OpenAiCompatContentPart = LocalContentPart;

export interface OpenAiCompatChatOptions {
  baseUrl: string;              // e.g. https://api.runpod.ai/v2/<id>/openai/v1
  model: string;                // served-model-name
  apiKey?: string;
  /** Text turns, or content parts (text + `image_url` data URLs) for a vision turn. */
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | OpenAiCompatContentPart[] }>;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  /** Serverless cold starts load ~28GB of weights — allow minutes. */
  timeoutMs?: number;
}

export interface OpenAiCompatChatResult {
  text: string;
  model: string;
  usage: AiUsage;
}

export async function openAiCompatChat(opts: OpenAiCompatChatOptions): Promise<OpenAiCompatChatResult> {
  await assertGpuBudget('local-lane chat'); // the GPU spend guard (2026-10-17)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const requested = opts.maxTokens ?? 1024;
  const window = localMaxModelLen();

  // Fit the 32k window (incident 2026-10-12): trim if needed, clamp
  // max_tokens; on the proxy-rewrapped overflow shape retry ONCE harder.
  const send = (fraction: number) => {
    const plan = planLocalRequest(opts.messages, requested, { window, fraction });
    logLocalPlan(plan);
    return fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: opts.model,
        max_tokens: plan.maxTokens,
        temperature: opts.temperature ?? 0.7,
        stop: opts.stopSequences?.length ? opts.stopSequences : undefined,
        messages: plan.messages,
        // vLLM Qwen3.x: suppress <think> blocks for lane work; the reasoning
        // parser is configured server-side and this flag is ignored elsewhere.
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8 * 60_000),
    });
  };

  let response = await send(1);
  if (!response.ok) {
    const detail = await response.text().catch(() => 'unknown error');
    if (!isRetryableLocalFailure(response.status, detail)) {
      throw new Error(`Local lane error (${response.status}): ${detail.slice(0, 500)}`);
    }
    console.warn(`[local] ${upstreamErrorMessage(response.status)}; retrying once with a shorter context`);
    response = await send(0.7);
    if (!response.ok) {
      await response.text().catch(() => '');
      throw new LocalLaneError(upstreamErrorMessage(response.status), LOCAL_LANE_USER_MESSAGE, response.status);
    }
  }

  const data = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    text: data.choices?.[0]?.message?.content ?? '',
    model: data.model ?? opts.model,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}
