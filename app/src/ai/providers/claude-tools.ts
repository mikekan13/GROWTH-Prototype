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
  usage: { inputTokens: number; outputTokens: number };
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

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.7,
    system: opts.systemPrompt,
    tools: opts.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as Anthropic.Messages.Tool['input_schema'],
    })),
    messages: opts.messages.map(m => ({
      role: m.role,
      content: m.content as unknown as Anthropic.Messages.MessageParam['content'],
    })),
  });

  return {
    stopReason: response.stop_reason ?? 'end_turn',
    blocks: response.content as unknown as ClaudeContentBlock[],
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
