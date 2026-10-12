/**
 * ai/network/transports/anthropic — the ONE Anthropic client for text calls.
 *
 * Consolidates the raw clients previously scattered across claude.ts
 * (fetch), classifier.ts, and create-dialog.ts. The JEWL tool-loop transport
 * (providers/claude-tools.ts) stays separate — it already carries the
 * caching breakpoints and tool plumbing — but shares this module's client.
 *
 * Every call returns full usage (incl. cache stats) so metering.recordAiCall
 * can price it.
 */

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { anthropicApiKey, anthropicBaseUrl } from '../config';
import type { AiUsage } from '../types';

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = anthropicApiKey();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  cachedClient = new Anthropic({ apiKey, baseURL: anthropicBaseUrl() });
  return cachedClient;
}

/** A text or base64 image block (multimodal user turns). */
export type AnthropicTextOrImageBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** The minimal client shape this transport needs — the SDK client, or a
 *  test/DAYA-injected fake. */
export interface AnthropicMessagesClient {
  messages: {
    create: (params: {
      model: string;
      max_tokens: number;
      temperature?: number;
      system?: string | Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }>;
      stop_sequences?: string[];
      messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicTextOrImageBlock[] }>;
    }) => Promise<{
      model?: string;
      content: Array<{ type: string; text?: string }>;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      };
    }>;
  };
}

export interface AnthropicChatOptions {
  model: string;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string | AnthropicTextOrImageBlock[] }>;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  /** Cache the system block (ephemeral). Worth it for stable prompts ≥1K
   *  tokens re-sent within the TTL; silently no-ops below the model minimum. */
  cacheSystem?: boolean;
}

export interface AnthropicChatResult {
  text: string;
  model: string;
  usage: AiUsage;
}

export async function anthropicChatText(
  opts: AnthropicChatOptions,
  injected?: AnthropicMessagesClient,
): Promise<AnthropicChatResult> {
  const client: AnthropicMessagesClient = injected ?? (getAnthropicClient() as unknown as AnthropicMessagesClient);

  const system = opts.system
    ? opts.cacheSystem
      ? [{ type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } }]
      : opts.system
    : undefined;

  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
    system,
    stop_sequences: opts.stopSequences?.length ? opts.stopSequences : undefined,
    messages: opts.messages,
  });

  const text = response.content
    .filter(b => b.type === 'text' && typeof b.text === 'string')
    .map(b => b.text as string)
    .join('');

  return {
    text,
    model: response.model ?? opts.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
