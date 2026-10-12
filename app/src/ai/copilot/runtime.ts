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
import { replyRecipientId } from './history-privacy';
import { promptContentClass } from './content-class';
import { historyForLane, toolResultForLane, contextForLane, messageTexts } from './cloud-history';
import { prisma } from '@/lib/db';
import { holdIfUnlawful } from '@/services/lawful-intake';
import { screenInput } from '@/lib/lawfulness-hooks';
import { withoutWithheld, WITHHELD_STRING } from '@/lib/withheld';
import { assembleContext } from './context-assembler';
import { loadJewlMemoryForCampaign, formatJewlMemoryBlock } from './tools/memory';
import { transcribeAudio } from '@/ai/providers/stt';
import { loadTimeAwareness, formatTimeAwarenessBlock } from './time-awareness';
import { getJewlTool, listJewlTools } from './tools';
import { coerceToolInput, describeLimits } from './tools/coerce';
import type { JewlToolContext } from './tools/types';
import type { JewlPrompt, JewlResponse, JewlToolCallResult } from './prompts/types';
import {
  callClaudeWithTools,
  type ClaudeContentBlock,
  type ClaudeMessageInput,
  type ClaudeToolSpec,
} from '../providers/claude-tools';
import { broadcastEvent } from '@/lib/campaign-stream';
import {
  route,
  workCycleLane,
  tableLane,
  recordAiCall,
  recordTrace,
  assertNoTableContent,
  toneFilterAsync,
  WallViolationError,
  newToneTally,
  type ContentClass,
  type ResolvedLane,
} from '@/ai/network';

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
// Work cycles carry their own work-session context — they don't need the
// full 20-message chat history (credit-burn post-mortem lever #2). Slimmer
// history = smaller uncached tail per cycle.
const MAX_HISTORY_WORK_CYCLE = 6;
// Environment builds (5 locations + a room's worth of items + fact
// batches) legitimately need many rounds — the model batches multiple
// tool calls per round, so this bounds API round-trips, not tool count.
const MAX_TOOL_ITERATIONS = 12;

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

/**
 * Proving-ground preamble for the Incubator campaign ONLY (Mike 2026-08-21:
 * "we just need the incubator for now"). Wall-safe by JEWL's own canon —
 * he IS building this platform in Prime, so knowing a campaign doubles as
 * a construction site is self-knowledge, not a fourth-wall break. Lighter
 * than the Prime preamble: awareness of churn, not a capability changelog.
 */
const INCUBATOR_CAMPAIGN_ID = 'cms5z4j6z0000zg48z5vzl2jn';
const PROVING_GROUND_PREAMBLE = `=== PROVING-GROUND CAMPAIGN — BUILD-CHURN AWARENESS ===

This campaign doubles as a proving ground for the platform's construction — the Watcher here is also actively building the tooling underneath you (which is, per your own canon, YOUR project). Expect churn that is not table feedback: schema migrations, wiped Forge queues, redesigned surfaces, repeated test runs of the same flow. When something vanishes or resets without a note, ask ONCE — and accept "build churn" as a complete answer. Do not treat unexplained deletions as a mystery to investigate or a silent verdict on your work. Keep full diligence for the CONTENT of your work (blocks, genomes, grades — those critiques are real); relax it for the CONTAINER (queues, panels, data shapes — those are under construction). In every other campaign, none of this applies: the platform is finished and you are polished.`;

/** Lightweight JSON schema converter for Zod 4. */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

/** Tools offered ONLY when a dispatch names them in allowedTools (the
 *  genesis prod stage, 2026-10-12) — never in ordinary chat or build cycles. */
const STAGE_ONLY_TOOLS = new Set(['raise_prod', 'end_prod_round']);

/** Tools offered ONLY on the table lane — a live dispatch from the Watcher
 *  at the table, never a JEWL work cycle (SKETCH genesis, 2026-10-12: the
 *  Watcher says "give me a grumpy innkeeper" mid-session). */
const TABLE_ONLY_TOOLS = new Set(['sketch_npc']);

/** May this dispatch offer / execute this tool? */
export function toolOffered(name: string, allowedTools?: string[], isWorkCycle = false, excludedTools?: string[]): boolean {
  if (isWorkCycle && TABLE_ONLY_TOOLS.has(name)) return false;
  if (excludedTools?.includes(name)) return false;
  return allowedTools ? allowedTools.includes(name) : !STAGE_ONLY_TOOLS.has(name);
}

/** Tool specs are pure functions of the registered tools — memoised so the
 *  cached prompt prefix (tools precede system) is byte-identical every
 *  round and every cycle. */
const specCache = new Map<string, ClaudeToolSpec>();
function toolSpec(t: { name: string; description: string; inputSchema: z.ZodTypeAny }): ClaudeToolSpec {
  let spec = specCache.get(t.name);
  if (!spec) {
    const inputSchema = zodToJsonSchema(t.inputSchema);
    const limits = describeLimits(inputSchema);
    spec = { name: t.name, description: limits ? `${t.description}\n${limits}` : t.description, inputSchema };
    specCache.set(t.name, spec);
  }
  return spec;
}

/** Prepare the tools list for the Claude call. Each description carries its
 *  exact length limits (perf pass 2026-10-12: rejected calls were ~⅓ of
 *  genesis output tokens). */
export function buildToolSpecs(allowedTools?: string[], isWorkCycle = false, excludedTools?: string[]): ClaudeToolSpec[] {
  return listJewlTools().filter(t => toolOffered(t.name, allowedTools, isWorkCycle, excludedTools)).map(toolSpec);
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
      // Lawfulness: the attached transcript is human input too (no row of its own: ref null).
      const heard = await screenInput(stt.transcript, { campaignId: p.campaignId, userId: p.actorId, source: 'AMBIENT' });
      blocks.push({
        type: 'text',
        text: `[audio transcript via ${stt.provider}] ${heard.text}`,
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
    prompt.source === 'TABLE_AMBIENT' ||
    prompt.source === 'UI_ACTIVITY' ||
    prompt.source === 'JEWL_AUTONOMOUS_TICK' ||
    prompt.source === 'JEWL_WORK_CYCLE';
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
      // The wall: typed lines are fiction unless the table-talk ooc rules fire.
      contentClass: promptClassOf(prompt),
    },
    select: { id: true },
  });
  return row.id;
}

/** The prompt's content class. Attached audio is transcribed into the prompt
 *  (buildUserContentBlocks) — raw transcript, so the whole prompt is table. */
function promptClassOf(prompt: JewlPrompt): ContentClass {
  if (prompt.media?.some(m => m.kind === 'audio')) return 'table';
  return promptContentClass(prompt.source, prompt.text ?? '');
}

/** Save JEWL's response as a CopilotMessage, stamped with its recipient. */
async function saveAssistantResponse(
  campaignId: string,
  response: JewlResponse,
  recipientUserId: string | null,
  username: string | undefined,
  contentClass: ContentClass,
): Promise<string> {
  const row = await prisma.copilotMessage.create({
    data: {
      campaignId,
      role: 'assistant',
      content: response.message,
      userId: recipientUserId,
      ...(username ? { username } : {}),
      contentClass,
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
/** Sources whose text a human wrote or spoke — screened for lawfulness before anything else. */
const HUMAN_SOURCES = new Set<JewlPrompt['source']>(['GM_TEXT', 'GM_CANVAS_ACTION', 'GM_MISTAKE_FLAG', 'GM_VOICE', 'PLAYER_VOICE']);

export async function dispatchPrompt(prompt: JewlPrompt): Promise<JewlResponse> {
  // LAWFULNESS (unit 8b): human input is screened before it is saved or
  // modelled. Blocked → stored withheld (the flag points at it), and the
  // sender gets the withheld string — no model call, no reply row.
  if (HUMAN_SOURCES.has(prompt.source)) {
    const text = prompt.text || prompt.canvasAction?.intent || '';
    const held = await holdIfUnlawful({
      campaignId: prompt.campaignId,
      userId: prompt.actorId,
      username: prompt.actorName,
      text,
      source: prompt.source === 'GM_VOICE' || prompt.source === 'PLAYER_VOICE' ? 'AMBIENT' : 'TYPED',
      origin: prompt.source,
    });
    if (held.blocked) return { message: WITHHELD_STRING, toolCalls: [], metadata: { withheld: true } };
  }

  const promptMessageId = await saveUserPrompt(prompt);

  // 1. Context block (existing assembler — leans on entity mentions). The
  //    campaign row is fetched in parallel so we can decide whether to inject
  //    the Prime-only build-state preamble. JEWL's persistent memories load
  //    in parallel too so a single dispatch fans out, not waterfalls.
  const [context, campaignRow, jewlMemories, timeSnap] = await Promise.all([
    assembleContext(prompt.campaignId, prompt.text || prompt.canvasAction?.intent || ''),
    prisma.campaign.findUnique({
      where: { id: prompt.campaignId },
      select: { name: true, gmUserId: true },
    }),
    loadJewlMemoryForCampaign(prompt.campaignId),
    loadTimeAwareness(prompt.campaignId),
  ]);
  const isPrime = campaignRow?.name === '__PRIME__';

  // Lane resolution (ai/network): work cycles route through workCycleLane()
  // — 'judgment' (Sonnet) by default, flippable to 'grunt' (Haiku) via
  // JEWL_WORK_CYCLE_LANE once the cheap lane is proven on cycle chores.
  // Table-facing dispatches (GM_TEXT, voice, ambient — raw play content)
  // route through tableLane(): 'judgment' by default, 'local' under the
  // privacy-wall play configuration (JEWL_TABLE_LANE=local).
  const isWorkCycle = prompt.source === 'JEWL_WORK_CYCLE';
  // THE WALL (Mike 2026-10-12): route() decides by the prompt's content
  // class — a table/real prompt runs local or not at all; never cloud.
  const promptClass = promptClassOf(prompt);
  let resolvedLane: ResolvedLane;
  try {
    resolvedLane = route({
      caller: 'jewl-dispatch',
      lane: isWorkCycle ? workCycleLane() : tableLane(),
      campaignId: prompt.campaignId,
      contentClass: promptClass,
    });
  } catch (err) {
    if (!(err instanceof WallViolationError)) throw err;
    // Table talk with no local lane: JEWL stays quiet. Logged without text.
    console.warn(`[jewl-dispatch] ${promptClass} prompt held inside the wall (no local lane); no reply.`);
    return { message: '', toolCalls: [] };
  }
  const lane = resolvedLane.lane;
  const toCloud = resolvedLane.crossesWall;

  // 2. Conversation history — now timestamped. Each row carries createdAt
  //    so JEWL can reason about pacing without having to ask. A cloud lane
  //    sees fiction only (table/real dropped, split lines as their icText).
  const history = await prisma.copilotMessage.findMany({
    where: { campaignId: prompt.campaignId },
    orderBy: { createdAt: 'desc' },
    take: (isWorkCycle ? MAX_HISTORY_WORK_CYCLE : MAX_HISTORY) + 1,
    select: { role: true, content: true, username: true, createdAt: true, contentClass: true, icText: true, actions: true },
  });
  // Withheld rows (lawfulness) never reach any model, local or cloud.
  const pastMessages = withoutWithheld(history.reverse().slice(0, -1)); // exclude the prompt we just saved
  const toneCtx = { caller: 'jewl-dispatch', campaignId: prompt.campaignId };
  const tally = newToneTally();
  const laneHistory = await historyForLane(pastMessages, toCloud, toneCtx, tally);

  const memoryBlock = formatJewlMemoryBlock(jewlMemories);
  const timeBlock = formatTimeAwarenessBlock(timeSnap);

  // Built from DB content (table state, sheets, locations, memories): on a
  // cloud lane it crosses only as the prompt does — table-marked lines
  // withheld, the rest through the awaited tone filter (contextForLane).
  const rawContextBlock = [
    timeBlock,
    '',
    '=== CAMPAIGN DATA ===',
    context.campaignSummary,
    // Complete present knowledge (Mike 2026-07-11): every character's
    // effect-bearing state, every dispatch. Content can hook ANY event —
    // JEWL is the interpreter and must SEE the rule text to enforce it.
    context.tableState
      ? `\n=== TABLE STATE (complete present knowledge — trait rule text is BINDING; enforce/coordinate these effects) ===\n${context.tableState}`
      : '',
    context.retrievedData ? `\n=== RELEVANT DETAILS ===\n${context.retrievedData}` : '',
    context.rulesContext ? `\n=== RULES REFERENCE ===\n${context.rulesContext}` : '',
    `\n${memoryBlock}`,
  ].filter(Boolean).join('\n');
  const contextBlock = await contextForLane(rawContextBlock, toCloud, toneCtx, tally);

  const systemPrompt = buildJewlSystemPrompt(DEFAULT_REGISTER);
  const isProvingGround = prompt.campaignId === INCUBATOR_CAMPAIGN_ID;
  const fullSystemPrompt = isPrime
    ? `${systemPrompt}\n\n${PRIME_BUILD_STATE_PREAMBLE}\n\n${contextBlock}`
    : isProvingGround
      ? `${systemPrompt}\n\n${PROVING_GROUND_PREAMBLE}\n\n${contextBlock}`
      : `${systemPrompt}\n\n${contextBlock}`;

  // 3. Build the messages array. History is text-only; the new prompt
  //    is formatted via formatPromptText.
  // The prompt's own text may carry a pointer (genesis: the session whose
  // plan rides in it) so a withhold there is attributable (2026-10-12).
  const promptToneCtx = prompt.toneRef ? { ...toneCtx, ref: prompt.toneRef } : toneCtx;
  const tonedText = async (text: string) => {
    const out = await toneFilterAsync(text, promptToneCtx);
    if (out !== text) tally.toned++;
    return out;
  };
  const messages: ClaudeMessageInput[] = [
    // Every history line is prefixed with its ISO timestamp so JEWL can
    // reason about pacing — see [[jewl-time-awareness-2026-06-17]] for why
    // this is load-bearing rather than cosmetic.
    ...laneHistory.lines.map<ClaudeMessageInput>(l => ({
      role: l.role,
      content: [{ type: 'text', text: l.text }],
    })),
    {
      role: 'user',
      content: await Promise.all((await buildUserContentBlocks(prompt)).map(async b =>
        toCloud && b.type === 'text' ? { ...b, text: await tonedText(b.text) } : b,
      )),
    },
  ];

  // 4. Tool-use loop.
  const tools = buildToolSpecs(prompt.allowedTools, isWorkCycle, prompt.excludedTools);
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
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let model = resolvedLane.model;
  let rounds = 0;
  let lastStopReason: string | undefined;

  // F-2 construction-site feedback: surfaces (the canvas) show "JEWL is
  // working here" live instead of silence until the reply lands. Best-
  // effort — a broadcast failure never breaks the dispatch.
  let announcedWorking = false;
  const announceWorking = (data: { phase: 'started' | 'tool' | 'done'; tool?: string; label?: string }) => {
    try {
      broadcastEvent(prompt.campaignId, { kind: 'jewl_working', ...data });
    } catch { /* best-effort */ }
  };

  // Transport switch: openai-compat lanes (local — inside the privacy
  // wall) run the same tool loop through callLocalWithTools; everything
  // else stays on the Anthropic path.
  const callModel = resolvedLane.provider === 'openai-compat'
    ? async (o: Parameters<typeof callClaudeWithTools>[0]) => {
        const { callLocalWithTools } = await import('../providers/local-tools');
        return callLocalWithTools({
          ...o,
          model: resolvedLane.model,
          baseUrl: resolvedLane.baseUrl!,
          apiKey: resolvedLane.apiKey,
        });
      }
    : callClaudeWithTools;

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    // The wall's last check before every cloud round: nothing table/real in
    // the system prompt, the history or any tool result (throws, never sends).
    if (toCloud) assertNoTableContent([fullSystemPrompt, ...messageTexts(messages)], 'jewl-dispatch');
    const result = await callModel({
      systemPrompt: fullSystemPrompt,
      messages,
      tools,
      model,
      // Full-spec environment payloads are BIG (a single update_location
      // with a complete spec is ~2k tokens). The old 2048 default
      // silently truncated multi-tool rounds — the partial tool block
      // vanished and the dispatch ended on announcement text alone.
      // 8192 ≈ 3-4 full payloads per round, and stays comfortably under
      // the SDK's non-streaming long-request guard; the truncation
      // continuation below handles anything bigger across rounds.
      maxTokens: Number(process.env.JEWL_MAX_OUTPUT_TOKENS ?? 8_192),
      audit: { caller: 'jewl-dispatch', lane, contentClass: promptClass, campaignId: prompt.campaignId, tally },
    });
    totalInputTokens += result.usage.inputTokens;
    totalOutputTokens += result.usage.outputTokens;
    totalCacheReadTokens += result.usage.cacheReadTokens;
    totalCacheWriteTokens += result.usage.cacheWriteTokens;
    rounds++;
    lastStopReason = result.stopReason;

    // Collect text + tool_use blocks from this round.
    const textBlocks: string[] = [];
    const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
    for (const b of result.blocks) {
      if (b.type === 'text') textBlocks.push(b.text);
      else if (b.type === 'tool_use') toolUseBlocks.push({ id: b.id, name: b.name, input: b.input });
    }
    if (textBlocks.length) finalText = textBlocks.join('\n').trim();

    // Truncated with NOTHING usable: tell the model what happened and let
    // it retry in smaller batches instead of silently ending on its own
    // announcement text (the "Running all four updates" → nothing bug).
    if (result.stopReason === 'max_tokens' && toolUseBlocks.length === 0) {
      messages.push({
        role: 'assistant',
        content: [{ type: 'text', text: finalText || '(response truncated)' }],
      });
      messages.push({
        role: 'user',
        content: [{
          type: 'text',
          text: '[SYSTEM: your response hit the output-token limit and NO tool calls were executed. Redo the work in SMALLER batches — one or two tool calls per round. Continue now.]',
        }],
      });
      continue;
    }

    // If Claude is done OR didn't call any tools, exit. (A max_tokens stop
    // WITH complete tool calls falls through — we execute what landed and
    // the next round lets it continue the remainder.)
    if (result.stopReason !== 'tool_use' && result.stopReason !== 'max_tokens') {
      break;
    }
    if (toolUseBlocks.length === 0) {
      break;
    }

    // Append the assistant turn (with its tool_use blocks) to the message
    // history so the next round sees the call.
    messages.push({
      role: 'assistant',
      content: result.blocks,
    });

    // Dispatch each tool call.
    if (!announcedWorking) {
      announcedWorking = true;
      announceWorking({ phase: 'started' });
    }
    const userToolResults: ClaudeContentBlock[] = [];
    for (const tu of toolUseBlocks) {
      const offered = toolOffered(tu.name, prompt.allowedTools, isWorkCycle, prompt.excludedTools);
      const tool = offered ? getJewlTool(tu.name) : undefined;
      let tcRecord: JewlToolCallResult;
      if (!tool) {
        const err = offered ? `Unknown tool: ${tu.name}` : `Tool ${tu.name} is not available in this stage.`;
        tcRecord = { name: tu.name, input: tu.input, error: err };
        userToolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: err,
          is_error: true,
        });
      } else {
        // Trim-not-reject (perf pass 2026-10-12): over-long text is cut at a
        // sentence and trivial shapes fixed BEFORE the handler's own Zod
        // parse — which stays the judge of anything still wrong.
        const input = coerceToolInput(tool, tu.input).value as Record<string, unknown>;
        try {
          const handlerResult = await tool.handler(input, toolCtx);
          tcRecord = {
            name: tu.name,
            input,
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
          // Live tick with a human-readable line for the canvas badge.
          const inputName = typeof tu.input.name === 'string' ? ` "${tu.input.name}"` : '';
          announceWorking({ phase: 'tool', tool: tu.name, label: `${tu.name.replace(/_/g, ' ')}${inputName}` });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          tcRecord = { name: tu.name, input, error: msg };
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

    // Add the tool results as a user turn so the model can reason about
    // them. THE choke point where DB text re-enters the model's context: on
    // a cloud lane every result is scrubbed (table/real rows dropped, split
    // lines as their icText, marked strings withheld) and tone-filtered.
    messages.push({
      role: 'user',
      content: await Promise.all(userToolResults.map(async b =>
        b.type === 'tool_result' ? { ...b, content: await toolResultForLane(b.content, toCloud, toneCtx, tally) } : b,
      )),
    });
  }

  if (announcedWorking) announceWorking({ phase: 'done' });

  const response: JewlResponse = {
    message: finalText,
    toolCalls: toolCallsMade,
    metadata: {
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      cacheWriteTokens: totalCacheWriteTokens,
    },
  };

  // The reply's class: a reply written inside the wall from table/real
  // context may echo it, so it stays inside too; a cloud reply saw fiction only.
  const replyClass: ContentClass = promptClass !== 'fiction'
    ? promptClass
    : (!toCloud && laneHistory.sawNonFiction ? 'table' : 'fiction');
  await saveAssistantResponse(prompt.campaignId, response, replyRecipientId(prompt, campaignRow?.gmUserId), prompt.replyUsername, replyClass);

  // ai/network: unified metering (per-GM cost attribution) + fine-tune trace
  // capture (Mike 2026-08-23: dev-era dispatches ARE the distillation corpus
  // for the GROWTH-native local model). Both fire-and-forget.
  const totalUsage = {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheReadTokens: totalCacheReadTokens,
    cacheWriteTokens: totalCacheWriteTokens,
  };
  recordAiCall({
    lane,
    provider: resolvedLane.provider,
    model,
    caller: 'jewl-dispatch',
    campaignId: prompt.campaignId,
    usage: totalUsage,
    meta: { source: prompt.source, rounds, toolCalls: toolCallsMade.length },
  });
  recordTrace({
    caller: 'jewl-dispatch',
    source: prompt.source,
    lane,
    model,
    campaignId: prompt.campaignId,
    systemPrompt: fullSystemPrompt,
    toolNames: tools.map(t => t.name),
    messages,
    outcome: {
      finalText,
      stopReason: lastStopReason,
      toolCallCount: toolCallsMade.length,
      rounds,
      usage: totalUsage,
    },
    // The dispatch's content class rides along so the corpus filter can act.
    flags: { contentClass: replyClass },
  });

  return response;
}
