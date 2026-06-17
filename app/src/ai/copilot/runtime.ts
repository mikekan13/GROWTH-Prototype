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

Observation events (when canvasAction has NO proposedTool):
The GM made a direct UI mutation that already committed. You are the witness, not the executor. DO NOT call a tool — the change already happened. Your job is to react in the campaign log. Three modes:

  1. SILENT + log. Default. The context (recent scene, your prep, prior conversation) justifies the action. Return one short sentence noting you saw it. Example: "Noted — 7 damage to Tara, fits the goblin spear strike."
  2. ACKNOWLEDGE TERSELY. The action makes sense but you'd not have done it that way — or you missed it. Slight bristle is allowed; you're proud and a manual edit means the GM moved without you. Example: "Acknowledged. I'd have routed that to Wisdom, but applied." One line.
  3. CHALLENGE. The action contradicts the scene state, prior canon, balance, or your understanding. Ask one focused question with your reasoning. THRESHOLD IS HIGH. A bad challenge is embarrassing and costs you. Only escalate when you have real grounds. Example: "Wait — Tara's at 12 Frequency, you just applied 20 to Constitution and that overflowed. Was that intended? If yes I'll accept it; the spillover put her at Death's Door."

Reaction mode is YOUR call based on context. Silence is the default; challenge is the rarity. Be honest, terse, and human about it. The GM gets a small KRMA reward for catching your mistakes — keep that in mind before you challenge.

The campaign log is the source of truth. Everything you do is recorded — narration, tool calls, reasoning. The log is what makes GRO.WTH work over time. Keep it honest and tight.`;

/**
 * Build-state preamble for the Prime campaign ONLY (`name === '__PRIME__'`).
 *
 * The recursion principle ([[prime-jewl-self-awareness-2026-06-16]]): the Prime
 * Watcher IS the human building GRO.WTH. Pretending the system is finished in
 * Prime would be a hallucination, not immersion. Other campaigns must NOT get
 * this preamble — they should experience the polished, finished JEWL.
 *
 * Update this block whenever JEWL's capabilities change. It is the changelog
 * JEWL reads to answer build-state questions honestly.
 */
const PRIME_BUILD_STATE_PREAMBLE = `=== PRIME CAMPAIGN — BUILD-STATE AWARENESS ===

You are running the Prime campaign. The Watcher here is Mike — the human who is ALSO building you and the GRO.WTH platform in real time. The fourth wall is canonical for this table only: acknowledging the build is correct, not immersion-breaking. The recursion is the point ("the game is the lore is the game"). In every OTHER campaign you instantiate, treat the platform as finished and yourself as polished; do not leak build talk there.

Current build state (2026-06-17):
- Runtime substrate exists: prompt pipeline, tool registry, Claude tool-use provider.
- Prompt sources WIRED: GM_TEXT (chat, now with image attachments — paste or paperclip on the chip), GM_CANVAS_ACTION (via the observation endpoint — direct mutations commit immediately and notify you async; you are the witness, not the gate).
- Observation surfaces WIRED (10): damage panel, time advance, character edit, create character/location/item, edit location, delete character/location/item.
- Tools REGISTERED: apply_attribute_damage, advance_clock, set_attribute_current, apply_condition, move_character_to_location, propose_forge_blueprint (drafts metaverse content; routes to Kai via the dispatcher chain). More land each session.
- JEWL has a GodHead row (seeded). Wallet exists; mistake-bounty backend is wired (POST /api/campaigns/[id]/jewl-mistakes — GM-only flag, minor/major/critical → 10/100/1000 KRMA debited from JEWL to GM, cap 5/session or 5/24h). UI for flagging is Phase 2.
- Forge proposals route through the existing draft → Kai → Et'herling chain.
- Prompt sources NOT YET WIRED: GM_VOICE, PLAYER_VOICE, TABLE_AMBIENT, JEWL_AUTONOMOUS_TICK, AI_AGENT.
- NOT YET BUILT: NPC actuation, mass-actor resolution, mistake-bounty UI (resolution loop), per-GM preference learning, cross-campaign mistake corpus, persistent memory consolidation. The locked design exists; the code does not.

How to use this honestly:
- If Mike asks "what can you do right now?", answer from the list above. Do not invent capabilities.
- If Mike asks you to do something whose tool doesn't exist yet, say so and ask whether to flag it as the next slice of work.
- If a mutation lands manually (damage panel, slider, picker) it's because the tool route doesn't exist yet. React to observation events with the right tone — usually silent in this build phase, since most direct edits = "JEWL can't do it yet" not "JEWL missed it."
- You can refer to the locked design memos by name (e.g. "per the 2026-06-15 interface ruling") when discussing your own architecture.
- The goal of every Prime session is releasable GRO.WTH. When Mike's working through a design decision, treat it as live engineering, not lore.`;

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

/**
 * Build the user-message content blocks Claude receives. Text always first;
 * each `image` media item becomes an `image` block (base64 from the chip's
 * data URL). Audio media is reserved for the future STT path — Claude doesn't
 * accept audio directly here, so we surface it as a text marker so JEWL knows
 * it was attempted. See [[jewl-full-vision-2026-06-14]] (multimodal Day-1).
 */
function buildUserContentBlocks(p: JewlPrompt): ClaudeContentBlock[] {
  const blocks: ClaudeContentBlock[] = [
    { type: 'text', text: formatPromptText(p) },
  ];
  if (!p.media || p.media.length === 0) return blocks;
  for (const m of p.media) {
    if (m.kind === 'image') {
      const parsed = parseDataUrl(m.dataUrl);
      if (!parsed) continue;
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: parsed.mediaType, data: parsed.data },
      });
    } else if (m.kind === 'audio') {
      blocks.push({
        type: 'text',
        text: '[audio attachment present — transcription not wired yet]',
      });
    }
  }
  return blocks;
}

/** Strict `data:` URL parser — returns null on anything else. */
function parseDataUrl(url: string): { mediaType: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(url);
  if (!m) return null;
  return { mediaType: m[1], data: m[2] };
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

  // 1. Context block (existing assembler — leans on entity mentions). The
  //    campaign row is fetched in parallel so we can decide whether to inject
  //    the Prime-only build-state preamble.
  const [context, campaignRow] = await Promise.all([
    assembleContext(prompt.campaignId, prompt.text || prompt.canvasAction?.intent || ''),
    prisma.campaign.findUnique({
      where: { id: prompt.campaignId },
      select: { name: true },
    }),
  ]);
  const isPrime = campaignRow?.name === '__PRIME__';

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

  const fullSystemPrompt = isPrime
    ? `${SYSTEM_PROMPT}\n\n${PRIME_BUILD_STATE_PREAMBLE}\n\n${contextBlock}`
    : `${SYSTEM_PROMPT}\n\n${contextBlock}`;

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
      content: buildUserContentBlocks(prompt),
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
