/**
 * Claude tool-use call — for JEWL's structured reasoning + canvas mutations.
 *
 * Uses the official @anthropic-ai/sdk with native tool-use. Returns the raw
 * blocks (text + tool_use) so the runtime can dispatch tools and loop.
 *
 * Distinct from `claude.ts` (the text-only provider used by Ollama-style
 * QoL features). This file is the deeper integration JEWL needs.
 */

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/** A simplified tool spec the runtime feeds in. */
export interface ClaudeToolSpec {
  name: string;
  description: string;
  /** JSON Schema (derived from Zod via z.toJSONSchema). */
  inputSchema: Record<string, unknown>;
}

export interface ClaudeMessageInput {
  role: 'user' | 'assistant';
  content: ClaudeContentBlock[];
}

export type ClaudeContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: string; data: string };
    }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | {
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    };

export interface ClaudeToolUseResult {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | string;
  blocks: ClaudeContentBlock[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Prompt-cache stats (2026-08-22 cost fix): cache reads bill at 10%
     *  of input price. inputTokens here counts only UNCACHED input. */
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const baseURL = process.env.ANTHROPIC_API_URL || undefined;
  cachedClient = new Anthropic({ apiKey, baseURL });
  return cachedClient;
}

export interface CallClaudeWithToolsOptions {
  systemPrompt: string;
  messages: ClaudeMessageInput[];
  tools: ClaudeToolSpec[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * One round-trip to Claude with tools available. The runtime loops on this
 * until stopReason !== 'tool_use' or a max-iteration guard fires.
 */
export async function callClaudeWithTools(
  opts: CallClaudeWithToolsOptions,
): Promise<ClaudeToolUseResult> {
  const client = getClient();
  // Default: Sonnet 4.6 — JEWL is copilot tier (tool-use + reasoning), not the
  // godhead-deep-reasoning tier that gets Opus. Override via env if needed.
  const model = opts.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

  // PROMPT CACHING (2026-08-22 — the credit burn was 3.78M input tokens in
  // 73 dispatches, avg 52K/dispatch, because every tool-loop round resent
  // the full prefix at full price). Two ephemeral breakpoints:
  //   1. The system block — tools + system are byte-identical every round
  //      AND across work cycles (4s apart), so this prefix is nearly always
  //      a 90%-discount cache read.
  //   2. The last block of the last message — a moving breakpoint: each
  //      round's new tail becomes the next round's cached prefix, so a
  //      10-round dispatch pays full price for each token roughly ONCE.
  const lastIdx = opts.messages.length - 1;
  const messagesWithCache = opts.messages.map((m, mi) => {
    if (mi !== lastIdx || m.content.length === 0) {
      return { role: m.role, content: m.content as unknown as Anthropic.Messages.MessageParam['content'] };
    }
    const content = m.content.map((block, bi) =>
      bi === m.content.length - 1
        ? { ...block, cache_control: { type: 'ephemeral' as const } }
        : block,
    );
    return { role: m.role, content: content as unknown as Anthropic.Messages.MessageParam['content'] };
  });

  const response = await client.messages.create(
    {
      model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      system: [{
        type: 'text' as const,
        text: opts.systemPrompt,
        cache_control: { type: 'ephemeral' as const },
      }],
      tools: opts.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Messages.Tool['input_schema'],
      })),
      messages: messagesWithCache,
    },
    {
      // Explicit per-request timeout: large-max_tokens non-streaming calls
      // otherwise trip the SDK's "streaming strongly recommended / may take
      // longer than 10 minutes" guard and REFUSE to send — which surfaces
      // as JEWL "thinking" forever with no reply and no error in the chat.
      timeout: 9 * 60 * 1000,
    },
  );

  return {
    stopReason: response.stop_reason ?? 'end_turn',
    blocks: response.content as unknown as ClaudeContentBlock[],
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
