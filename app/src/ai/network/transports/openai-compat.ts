/**
 * ai/network/transports/openai-compat — the LOCAL lane transport.
 *
 * Speaks the OpenAI chat-completions dialect, which covers every shape the
 * local lane takes: RunPod serverless vLLM (base = .../v2/<endpoint>/openai/v1),
 * a dev vLLM pod, or any other OpenAI-compatible server. This lane runs on
 * company-controlled compute — it is the inner face of the wall.
 */

import 'server-only';
import type { AiUsage } from '../types';

export interface OpenAiCompatChatOptions {
  baseUrl: string;              // e.g. https://api.runpod.ai/v2/<id>/openai/v1
  model: string;                // served-model-name
  apiKey?: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
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
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const response = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.7,
      stop: opts.stopSequences?.length ? opts.stopSequences : undefined,
      messages: opts.messages,
      // vLLM Qwen3.x: suppress <think> blocks for lane work; the reasoning
      // parser is configured server-side and this flag is ignored elsewhere.
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8 * 60_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => 'unknown error');
    throw new Error(`Local lane error (${response.status}): ${detail.slice(0, 500)}`);
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
