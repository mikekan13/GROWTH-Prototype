/**
 * Local-lane tool-use call — the privacy-wall sibling of claude-tools.
 *
 * Same interface as callClaudeWithTools (Anthropic-shaped blocks in and
 * out) so the runtime's tool loop is transport-blind; underneath it speaks
 * the OpenAI chat-completions dialect to the company-controlled serverless
 * vLLM endpoint (growth-local). Born 2026-08-29: Mike plays as himself, so
 * table-facing dispatches must run inside the wall (JEWL_TABLE_LANE=local).
 *
 * Known deltas vs the Anthropic path (accepted for the local lane):
 * - No prompt caching (cacheRead/Write always 0) — vLLM handles prefix
 *   reuse server-side via automatic prefix caching.
 * - Image blocks are dropped with a placeholder (text-only lane).
 */

import 'server-only';
import type {
  CallClaudeWithToolsOptions,
  ClaudeContentBlock,
  ClaudeToolUseResult,
} from './claude-tools';

export interface CallLocalWithToolsOptions extends CallClaudeWithToolsOptions {
  baseUrl: string;
  apiKey?: string;
  /** Required for the local lane — the served-model-name. */
  model: string;
  /** Serverless cold starts load ~28GB of weights — allow minutes. */
  timeoutMs?: number;
}

type OaMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OaToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface OaToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

function blocksToText(blocks: ClaudeContentBlock[]): string {
  return blocks
    .map(b => {
      if (b.type === 'text') return b.text;
      if (b.type === 'image') return '[image omitted — local lane is text-only]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Convert the runtime's Anthropic-shaped history to OpenAI dialect. */
function convertMessages(opts: CallLocalWithToolsOptions): OaMessage[] {
  const out: OaMessage[] = [{ role: 'system', content: opts.systemPrompt }];
  for (const m of opts.messages) {
    if (m.role === 'assistant') {
      const toolCalls: OaToolCall[] = m.content
        .filter((b): b is Extract<ClaudeContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        .map(b => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      const text = blocksToText(m.content);
      out.push({
        role: 'assistant',
        content: text || (toolCalls.length ? null : ''),
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });
    } else {
      // User turns: tool_result blocks become 'tool' messages; the rest
      // collapses into a plain user message.
      const results = m.content.filter(
        (b): b is Extract<ClaudeContentBlock, { type: 'tool_result' }> => b.type === 'tool_result',
      );
      for (const r of results) {
        out.push({
          role: 'tool',
          tool_call_id: r.tool_use_id,
          content: (r.is_error ? '[TOOL ERROR] ' : '') + r.content,
        });
      }
      const rest = m.content.filter(b => b.type !== 'tool_result');
      const text = blocksToText(rest);
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

function mapStopReason(finish: string | undefined): ClaudeToolUseResult['stopReason'] {
  switch (finish) {
    case 'tool_calls': return 'tool_use';
    case 'length': return 'max_tokens';
    case 'stop': return 'end_turn';
    default: return finish ?? 'end_turn';
  }
}

let toolUseCounter = 0;

export async function callLocalWithTools(
  opts: CallLocalWithToolsOptions,
): Promise<ClaudeToolUseResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const response = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      messages: convertMessages(opts),
      tools: opts.tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
      // vLLM Qwen3.x: suppress <think> blocks; parser configured server-side.
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
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: string | null; tool_calls?: OaToolCall[] };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = data.choices?.[0];
  const blocks: ClaudeContentBlock[] = [];
  if (choice?.message?.content) blocks.push({ type: 'text', text: choice.message.content });
  for (const tc of choice?.message?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try { input = JSON.parse(tc.function.arguments || '{}'); }
    catch {
      // Malformed arguments: surface as text so the loop's error path
      // (tool schema validation) reports it instead of a silent {}.
      blocks.push({ type: 'text', text: `[tool-call arguments unparseable for ${tc.function.name}]` });
      continue;
    }
    blocks.push({
      type: 'tool_use',
      id: tc.id || `local_tu_${++toolUseCounter}`,
      name: tc.function.name,
      input,
    });
  }

  // Some servers report finish_reason 'stop' even when tool_calls exist —
  // normalize: tool calls present means the loop must execute them.
  const hasTools = blocks.some(b => b.type === 'tool_use');
  const stopReason = hasTools ? 'tool_use' : mapStopReason(choice?.finish_reason);

  return {
    stopReason,
    blocks,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
  };
}
