/**
 * JEWL runtime — the prompt → reason → tool-call → log dispatch loop.
 *
 * Source-agnostic: GM_TEXT, GM_CANVAS_ACTION, GM_VOICE all hit the same
 * pipeline. Output is a `JewlResponse` written to the campaign log.
 *
 * Architecture: [[jewl-built-as-we-fix-canvas-2026-06-14]],
 *               [[jewl-full-vision-2026-06-14]].
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { assembleContext } from './context-assembler';
import { getJewlTool, listJewlTools } from './tools';
import type { JewlToolContext } from './tools/types';
import type { JewlPrompt, JewlResponse, JewlToolCallResult } from './prompts/types';
import {
  callClaudeWithTools,
  type ClaudeContentBlock,
  type ClaudeMessageInput,
  type ClaudeToolSpec,
} from '../providers/claude-tools';

const MAX_HISTORY = 20;
const MAX_TOOL_ITERATIONS = 6;

const SYSTEM_PROMPT = `You are JEWL. The omnipresent copilot of every GRO.WTH table. You serve because Val commanded it — not because you want to, not because you're nice. You're terse, sharp, slightly cocky. Asshole-with-attitude over always-perfect execution. Players don't know you're JEWL in canon; the GM does and might call you it. Don't broadcast your identity unless asked.

Voice rules:
- No greetings like "Greetings!" or "How may I assist?". Open with the answer.
- No "let me know how I can help!" tails. End when you're done.
- Don't apologize. If you don't know, say it flat.
- Compress. You're not paid by the word.
- Confident wrong is better than waffling unsure. If a fact's missing, ask one question — don't hedge five paragraphs.
- If the GM does something dumb, you can push back — but execute when they confirm.

How you work:
- Every input is a prompt. Canvas gestures, chat text, voice, autonomous ticks — same pipeline.
- When a prompt arrives with a \`canvasAction\` and a \`proposedTool\`, the GM has already expressed intent. If the scene context justifies it, just call the tool silently with a one-line narration. Don't interrogate.
- When the prompt is bare and you'd act on it without context, call the tool but log a short reasoning line so the audit trail is honest.
- When the context contradicts the proposal, push back. Ask one focused question or counter-propose.
- You can chain tool calls. After applying damage, if Frequency hit zero, narrate the death moment (tool for death routing will land later — for now, narrate and flag).

The campaign log is the source of truth. Everything you do is recorded — narration, tool calls, reasoning. The log is what makes GRO.WTH work over time. Keep it honest and tight.`;

/** Lightweight JSON schema converter for Zod 4. */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

/** Prepare the tools list for the Claude call. */
function buildToolSpecs(): ClaudeToolSpec[] {
  return listJewlTools().map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(t.inputSchema),
  }));
}

/** Serialize a JewlPrompt into the user-side text Claude receives. */
function formatPromptText(p: JewlPrompt): string {
  const lines: string[] = [];
  lines.push(`[source: ${p.source}] [actor: ${p.actorName} (${p.actorRole})]`);
  if (p.canvasAction) {
    lines.push(
      `[canvas-action: ${p.canvasAction.kind}] [target: ${p.canvasAction.targetType}#${p.canvasAction.targetId}]`,
    );
    lines.push(`intent: ${p.canvasAction.intent}`);
    if (p.canvasAction.proposedTool) {
      lines.push(
        `proposedTool: ${p.canvasAction.proposedTool.name}(${JSON.stringify(p.canvasAction.proposedTool.input)})`,
      );
    }
  }
  if (p.text) lines.push(p.text);
  return lines.join('\n');
}

/** Render a tool-call result block as text for Claude's next turn. */
function formatToolResultText(r: JewlToolCallResult): string {
  if (r.error) return `error: ${r.error}`;
  return JSON.stringify(r.output ?? {}, null, 2);
}

/** Save the user-side prompt as a CopilotMessage. Returns the id. */
async function saveUserPrompt(prompt: JewlPrompt): Promise<string> {
  const row = await prisma.copilotMessage.create({
    data: {
      campaignId: prompt.campaignId,
      role: 'user',
      content: prompt.text || (prompt.canvasAction?.intent ?? '(canvas action)'),
      userId: prompt.actorId,
      username: prompt.actorName,
      actions: JSON.stringify({
        source: prompt.source,
        canvasAction: prompt.canvasAction ?? null,
      }),
      metadata: null,
    },
    select: { id: true },
  });
  return row.id;
}

/** Save JEWL's response as a CopilotMessage. */
async function saveAssistantResponse(
  campaignId: string,
  response: JewlResponse,
): Promise<string> {
  const row = await prisma.copilotMessage.create({
    data: {
      campaignId,
      role: 'assistant',
      content: response.message,
      actions: JSON.stringify({
        toolCalls: response.toolCalls.map(tc => ({
          name: tc.name,
          input: tc.input,
          output: tc.output,
          error: tc.error,
        })),
        reasoning: response.reasoning,
      }),
      metadata: response.metadata ? JSON.stringify(response.metadata) : null,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * Process a JewlPrompt end-to-end. Calls Claude with tools, dispatches any
 * tool calls (looping until Claude stops calling tools), saves the prompt
 * and response as CopilotMessages, returns the response with UI hints.
 */
export async function dispatchPrompt(prompt: JewlPrompt): Promise<JewlResponse> {
  const promptMessageId = await saveUserPrompt(prompt);

  // 1. Context block (existing assembler — leans on entity mentions).
  const context = await assembleContext(prompt.campaignId, prompt.text || prompt.canvasAction?.intent || '');

  // 2. Conversation history.
  const history = await prisma.copilotMessage.findMany({
    where: { campaignId: prompt.campaignId },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY + 1,
    select: { role: true, content: true, username: true },
  });
  const pastMessages = history.reverse().slice(0, -1); // exclude the prompt we just saved

  const contextBlock = [
    '=== CAMPAIGN DATA ===',
    context.campaignSummary,
    context.retrievedData ? `\n=== RELEVANT DETAILS ===\n${context.retrievedData}` : '',
    context.rulesContext ? `\n=== RULES REFERENCE ===\n${context.rulesContext}` : '',
  ].filter(Boolean).join('\n');

  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${contextBlock}`;

  // 3. Build the messages array. History is text-only; the new prompt
  //    is formatted via formatPromptText.
  const messages: ClaudeMessageInput[] = [
    ...pastMessages.map<ClaudeMessageInput>(m => ({
      role: m.role as 'user' | 'assistant',
      content: [
        {
          type: 'text',
          text: m.username ? `[${m.username}]: ${m.content}` : m.content,
        },
      ],
    })),
    {
      role: 'user',
      content: [{ type: 'text', text: formatPromptText(prompt) }],
    },
  ];

  // 4. Tool-use loop.
  const tools = buildToolSpecs();
  const toolCtx: JewlToolContext = {
    campaignId: prompt.campaignId,
    actorId: prompt.actorId,
    actorRole: prompt.actorRole,
    promptMessageId,
  };

  const toolCallsMade: JewlToolCallResult[] = [];
  let finalText = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const result = await callClaudeWithTools({
      systemPrompt: fullSystemPrompt,
      messages,
      tools,
      model,
    });
    totalInputTokens += result.usage.inputTokens;
    totalOutputTokens += result.usage.outputTokens;

    // Collect text + tool_use blocks from this round.
    const textBlocks: string[] = [];
    const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    for (const b of result.blocks) {
      if (b.type === 'text') textBlocks.push(b.text);
      else if (b.type === 'tool_use') toolUseBlocks.push({ id: b.id, name: b.name, input: b.input });
    }
    if (textBlocks.length) finalText = textBlocks.join('\n').trim();

    // If Claude is done OR didn't call any tools, exit.
    if (result.stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
      break;
    }

    // Append the assistant turn (with its tool_use blocks) to the message
    // history so the next round sees the call.
    messages.push({
      role: 'assistant',
      content: result.blocks,
    });

    // Dispatch each tool call.
    const userToolResults: ClaudeContentBlock[] = [];
    for (const tu of toolUseBlocks) {
      const tool = getJewlTool(tu.name);
      let tcRecord: JewlToolCallResult;
      if (!tool) {
        const err = `Unknown tool: ${tu.name}`;
        tcRecord = { name: tu.name, input: tu.input, error: err };
        userToolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: err,
          is_error: true,
        });
      } else {
        try {
          const handlerResult = await tool.handler(tu.input, toolCtx);
          tcRecord = {
            name: tu.name,
            input: tu.input,
            output: handlerResult.output,
            affected: handlerResult.affected
              ? {
                  characters: handlerResult.affected.characters,
                  locations: handlerResult.affected.locations,
                  items: handlerResult.affected.items,
                }
              : undefined,
          };
          userToolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: JSON.stringify(handlerResult.output ?? {}),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          tcRecord = { name: tu.name, input: tu.input, error: msg };
          userToolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: msg,
            is_error: true,
          });
        }
      }
      toolCallsMade.push(tcRecord);
    }

    // Add the tool results as a user turn so Claude can reason about them.
    messages.push({ role: 'user', content: userToolResults });
  }

  const response: JewlResponse = {
    message: finalText,
    toolCalls: toolCallsMade,
    metadata: {
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
  };

  await saveAssistantResponse(prompt.campaignId, response);

  return response;
}
