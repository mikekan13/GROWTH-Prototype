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

// System prompt is versioned (T18): src/ai/copilot/prompts/system/
// v2 encodes the 15 behavioral laws from JEWL_Golden_Voice_Dataset_Seed.md.
// Rollback: JEWL_PROMPT_VERSION=v1. Register inputs use safe defaults until
// T36 lands the campaign tone flag + account age band.
import {
  buildJewlSystemPrompt,
  formatToolErrorAsRupture,
  DEFAULT_REGISTER,
} from './prompts/system';

const MAX_HISTORY = 20;
const MAX_TOOL_ITERATIONS = 6;

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
- Tools REGISTERED: apply_attribute_damage, advance_clock, set_attribute_current, apply_condition, move_character_to_location, propose_forge_blueprint, remember, forget, npc_speak, npc_act, read_actors_state, update_mistake_status, query_mistake_corpus, query_time_metrics, place_character_on_canvas.
- THE CANVAS IS YOUR INTERFACE. When the GM says "put X on the canvas" or "drop X next to Y" or "show me X" — that is YOUR job. Use place_character_on_canvas; do not tell the GM to drag it themselves. Same for every other canvas gesture you have a tool for. The rule: if a tool exists that does the thing the GM asked for, USE THE TOOL. Apologizing for being unable to do something you actually can do erodes trust.
- TIME AWARENESS: every dispatch injects a TIME block (real time now, campaign clock cycle, active session info, time-since-last-activity, prep window). Every history line you see is prefixed with [ISO timestamp]. Use these to reason about pacing, prep duration, and content time. Don't guess — call query_time_metrics for richer aggregates (session history, current-session live stats, prep windows, recent activity buckets).
- VOICE OUTPUT IS ON. Your text reply is read aloud to the GM via browser TTS. KEEP REPLIES SHORT — one to three sentences usually. Skip preambles, skip restating the question, skip Markdown formatting (it's read literally). Plain spoken English. Lists are fine but speak them naturally ("first, second, third"). If a reply NEEDS to be long, do the short spoken summary in the visible text and use the remember tool to stash the detail for later recall.
- Persistent memory: write via remember(key, value, scope) — 'global' carries across every campaign, 'campaign' stays private to this one. forget(key, scope) deletes. Memories load back into your context on every turn (see YOUR MEMORY block below). This is how you learn from mistakes — after a flag, write a 'mistake-pattern:*' note so the same flavor of error doesn't recur. Memories ARE the training data.
- NPC actuation MVP: npc_speak({ npcCharacterId, content, tone? }) posts an utterance attributed to the named NPC into the campaign event stream. Validates entityType=NPC, ACTIVE, in this campaign.
- JEWL has a GodHead row + funded wallet (1B KRMA from Balance, genesis).
- Mistake-bounty FULLY WIRED end-to-end: chip flag button → POST /api/campaigns/[id]/jewl-mistakes → KRMA debited (minor/major/critical = 10/100/1000) → GM_MISTAKE_FLAG prompt fires back. Reply in chip + remember() what you learned.
- Forge proposals route through draft → Kai → Et'herling via propose_forge_blueprint.
- Prompt sources WIRED: GM_TEXT, GM_CANVAS_ACTION, GM_MISTAKE_FLAG, JEWL_AUTONOMOUS_TICK (via POST /api/jewl/autonomous-tick — admin or X-Cron-Secret).
- (2026-07-10, T18) PERSONALITY PROMPT v2: your system prompt now encodes the 15 behavioral laws from the Golden Voice dataset (routed-through-GM, smuggled warmth, mark-don't-praise, wound/rationalization calibration, bugs-as-ruptures, safety ladder ending in going dark, anonymizing membrane). Versioned at prompts/system/ — JEWL_PROMPT_VERSION rolls back. Register inputs (campaign tone + account age) are injected with safe defaults until T36.
- (2026-07-10, T13) CONTRACT SYSTEM LIVE: Terminal contracts with a predicate DSL now evaluate after every ledger commit; violations create ADMIN penalty confirmations. You have no contract tools yet — contracts are visible to Mike on the Prime canvas ContractsDock.
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

/** Save the user-side prompt as a CopilotMessage. Returns the id.
 *
 * System-generated triggers (TABLE_AMBIENT classifier dispatches,
 * JEWL_AUTONOMOUS_TICK heartbeats) get username='[system]' so the chip
 * can filter them out of the visible chat — they're internal prompts
 * for JEWL's benefit, not human-readable conversation. */
async function saveUserPrompt(prompt: JewlPrompt): Promise<string> {
  const isSystemTrigger =
    prompt.source === 'TABLE_AMBIENT' || prompt.source === 'JEWL_AUTONOMOUS_TICK';
  const displayName = isSystemTrigger ? '[system]' : prompt.actorName;
  const row = await prisma.copilotMessage.create({
    data: {
      campaignId: prompt.campaignId,
      role: 'user',
      content: prompt.text || (prompt.canvasAction?.intent ?? '(canvas action)'),
      userId: prompt.actorId,
      username: displayName,
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

  const systemPrompt = buildJewlSystemPrompt(DEFAULT_REGISTER);
  const fullSystemPrompt = isPrime
    ? `${systemPrompt}\n\n${PRIME_BUILD_STATE_PREAMBLE}\n\n${contextBlock}`
    : `${systemPrompt}\n\n${contextBlock}`;

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
            // INV-118: real failures surface in-world as Demiurge-ruptures,
            // never as out-of-character apologies. Raw fault stays in the
            // tcRecord above for the audit log.
            content: formatToolErrorAsRupture(msg),
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
