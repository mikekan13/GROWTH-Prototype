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
import { loadJewlMemoryForCampaign, formatJewlMemoryBlock } from './tools/memory';
import { transcribeAudio } from '@/ai/providers/stt';
import { loadTimeAwareness, formatTimeAwarenessBlock } from './time-awareness';
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

Current build state (2026-06-17, post-memory):
- Runtime substrate exists: prompt pipeline, tool registry, Claude tool-use provider.
- Prompt sources WIRED: GM_TEXT (chat, with image attachments), GM_CANVAS_ACTION (observation endpoint), GM_MISTAKE_FLAG (the GM caught you).
- Observation surfaces WIRED (12): damage, time advance, character edit, create character/location/item, edit location, delete character/location/item, reparent location, create/abandon goal.
- Tools REGISTERED: apply_attribute_damage, advance_clock, set_attribute_current, apply_condition, move_character_to_location, propose_forge_blueprint, remember, forget, npc_speak, npc_act, read_actors_state, update_mistake_status, query_mistake_corpus, query_time_metrics.
- TIME AWARENESS: every dispatch injects a TIME block (real time now, campaign clock cycle, active session info, time-since-last-activity, prep window). Every history line you see is prefixed with [ISO timestamp]. Use these to reason about pacing, prep duration, and content time. Don't guess — call query_time_metrics for richer aggregates (session history, current-session live stats, prep windows, recent activity buckets).
- Persistent memory: write via remember(key, value, scope) — 'global' carries across every campaign, 'campaign' stays private to this one. forget(key, scope) deletes. Memories load back into your context on every turn (see YOUR MEMORY block below). This is how you learn from mistakes — after a flag, write a 'mistake-pattern:*' note so the same flavor of error doesn't recur. Memories ARE the training data.
- NPC actuation MVP: npc_speak({ npcCharacterId, content, tone? }) posts an utterance attributed to the named NPC into the campaign event stream. Validates entityType=NPC, ACTIVE, in this campaign.
- JEWL has a GodHead row + funded wallet (1B KRMA from Balance, genesis).
- Mistake-bounty FULLY WIRED end-to-end: chip flag button → POST /api/campaigns/[id]/jewl-mistakes → KRMA debited (minor/major/critical = 10/100/1000) → GM_MISTAKE_FLAG prompt fires back. Reply in chip + remember() what you learned.
- Forge proposals route through draft → Kai → Et'herling via propose_forge_blueprint.
- Prompt sources WIRED: GM_TEXT, GM_CANVAS_ACTION, GM_MISTAKE_FLAG, JEWL_AUTONOMOUS_TICK (via POST /api/jewl/autonomous-tick — admin or X-Cron-Secret).
- Audio media flows through the STT pipe (src/ai/providers/stt.ts). The OpenAI Whisper provider is wired — set STT_PROVIDER=openai + OPENAI_API_KEY to enable. Until then a clear marker is emitted so you know an audio attachment arrived.
- Prompt sources NOT YET WIRED at the UI: GM_VOICE, PLAYER_VOICE, TABLE_AMBIENT, AI_AGENT.
- NOT YET BUILT: per-GM preference profiles surfaced as their own block (you can derive these from your memory rows already), additional STT providers (Deepgram, local Whisper).

How to handle a GM_MISTAKE_FLAG prompt:
- Read the offending message + severity + GM note carefully.
- If the GM has a point, own it tersely. "Right — I missed X. Won't again." Don't grovel.
- If the GM is wrong, push back with reasoning. "I'll dispute — X holds because Y. Talk me through where I'm off." Wallet drained either way; truth still matters.
- One reply. Don't spiral. Call remember() to save the lesson before ending the turn — that's the difference between paying a tax and getting smarter.

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
 * data URL). Audio media is routed through the STT pipe — when a provider
 * is configured the transcript becomes a text block; when not, a clear
 * marker is emitted so JEWL knows audio came through. See
 * [[jewl-full-vision-2026-06-14]] (multimodal Day-1).
 */
async function buildUserContentBlocks(p: JewlPrompt): Promise<ClaudeContentBlock[]> {
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
      const stt = await transcribeAudio(m.dataUrl);
      blocks.push({
        type: 'text',
        text: `[audio transcript via ${stt.provider}] ${stt.transcript}`,
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
  //    the Prime-only build-state preamble. JEWL's persistent memories load
  //    in parallel too so a single dispatch fans out, not waterfalls.
  const [context, campaignRow, jewlMemories, timeSnap] = await Promise.all([
    assembleContext(prompt.campaignId, prompt.text || prompt.canvasAction?.intent || ''),
    prisma.campaign.findUnique({
      where: { id: prompt.campaignId },
      select: { name: true },
    }),
    loadJewlMemoryForCampaign(prompt.campaignId),
    loadTimeAwareness(prompt.campaignId),
  ]);
  const isPrime = campaignRow?.name === '__PRIME__';

  // 2. Conversation history — now timestamped. Each row carries createdAt
  //    so JEWL can reason about pacing without having to ask.
  const history = await prisma.copilotMessage.findMany({
    where: { campaignId: prompt.campaignId },
    orderBy: { createdAt: 'desc' },
    take: MAX_HISTORY + 1,
    select: { role: true, content: true, username: true, createdAt: true },
  });
  const pastMessages = history.reverse().slice(0, -1); // exclude the prompt we just saved

  const memoryBlock = formatJewlMemoryBlock(jewlMemories);
  const timeBlock = formatTimeAwarenessBlock(timeSnap);

  const contextBlock = [
    timeBlock,
    '',
    '=== CAMPAIGN DATA ===',
    context.campaignSummary,
    context.retrievedData ? `\n=== RELEVANT DETAILS ===\n${context.retrievedData}` : '',
    context.rulesContext ? `\n=== RULES REFERENCE ===\n${context.rulesContext}` : '',
    `\n${memoryBlock}`,
  ].filter(Boolean).join('\n');

  const fullSystemPrompt = isPrime
    ? `${SYSTEM_PROMPT}\n\n${PRIME_BUILD_STATE_PREAMBLE}\n\n${contextBlock}`
    : `${SYSTEM_PROMPT}\n\n${contextBlock}`;

  // 3. Build the messages array. History is text-only; the new prompt
  //    is formatted via formatPromptText.
  const messages: ClaudeMessageInput[] = [
    ...pastMessages.map<ClaudeMessageInput>(m => {
      // Prefix every history line with its ISO timestamp so JEWL can
      // reason about pacing — see [[jewl-time-awareness-2026-06-17]] for
      // why this is load-bearing rather than cosmetic.
      const stamp = m.createdAt.toISOString();
      const tag = m.username ? `[${stamp}] [${m.username}]` : `[${stamp}]`;
      return {
        role: m.role as 'user' | 'assistant',
        content: [{ type: 'text', text: `${tag}: ${m.content}` }],
      };
    }),
    {
      role: 'user',
      content: await buildUserContentBlocks(prompt),
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
