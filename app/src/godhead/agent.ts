/**
 * GodHeadAgent — The runtime for a single god-head invocation.
 *
 * A god-head is a persistent AI agent, not a prompt template. This class:
 * 1. Loads the god-head's identity (character sheet, system prompt, memory)
 * 2. Builds the Claude message list with tools
 * 3. Runs the agent loop: think → tool call → observe → think → ...
 * 4. Persists action logs, memory updates, and token usage
 *
 * Uses the Anthropic SDK with tool use. Each invocation is one unit of work
 * triggered by an event (goal created, blueprint submitted, GM request, etc.)
 *
 * One invocation per god-head at a time. The dispatcher handles sequencing.
 */

import 'server-only';
import {
  callClaudeWithTools,
  type ClaudeContentBlock,
  type ClaudeMessageInput,
  type ClaudeToolSpec,
} from '@/ai/providers/claude-tools';
import { route, prepareCloudText, assertNoTableContent, newToneTally, type ResolvedLane, type TaskDescriptor } from '@/ai/network';
import { toolResultForLane, messageTexts } from '@/ai/copilot/cloud-history';
import { prisma } from '@/lib/db';
import { getClaudeToolDefinitions, executeTool } from './tools/registry';
import type { ToolContext } from './tools/registry';

// Import tools so they self-register
import './tools/read-entity';
import './tools/read-wallet';
import './tools/read-my-wallet';
import './tools/query-relationships';
import './tools/list-goals';
import './tools/read-goal';
import './tools/search-blueprints';
import './tools/read-blueprint';
import './tools/read-my-memory';
import './tools/write-my-memory';
import './tools/adopt-goal';
import './tools/release-goal';
import './tools/propose-resistance';
import './tools/draft-blueprint';
import './tools/send-message-to-gm';
import './tools/transfer-krma';
import './tools/evaluate-blueprint';
import './tools/process-death';
import './tools/decay-blueprint';
import './tools/route-to-godhead';
import './tools/propose-nectar-bestowal';
import './tools/propose-thorn-imposition';
import './tools/rule-jewl-mistake';

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_STEPS = 20;
const DEFAULT_MODEL = 'claude-sonnet-4-6';  // Per-action model selection, Sonnet for routine work

// ── Types ─────────────────────────────────────────────────────────────────

interface InvocationResult {
  invocationId: string;
  status: 'DONE' | 'FAILED';
  result?: string;
  error?: string;
  steps: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

interface GodHeadIdentity {
  id: string;
  name: string;
  domain: string;
  pillar: string;
  systemPrompt: string;
  temperature: number;
  defaultModel: string | null;
  walletId: string | null;
  characterId: string;
}

// ── Agent Class ───────────────────────────────────────────────────────────

/**
 * THE WALL (Mike 2026-10-12): a god-head reasons over the world's fiction —
 * entities, wallets, goals, blueprints, its own memory. route() decides the
 * lane (class fiction); on a cloud lane the system prompt, the trigger and
 * every tool result pass the tone filter and the table guard (tool results
 * scrubbed of table/real rows), and the payload is checked before every
 * round. The tool-use transport is the one ai/providers/claude-tools exposes.
 */
const GODHEAD_TASK: TaskDescriptor = {
  caller: 'godhead-agent',
  lane: 'godhead',
  contentClass: 'fiction',
};

export class GodHeadAgent {
  private identity: GodHeadIdentity;
  private model: string;

  constructor(identity: GodHeadIdentity, model?: string) {
    this.identity = identity;
    // Resolution order: explicit override → god-head's stored default → runtime default.
    this.model = model || identity.defaultModel || DEFAULT_MODEL;
  }

  /**
   * Load a god-head by name and prepare the agent.
   */
  static async load(name: string, model?: string): Promise<GodHeadAgent> {
    const godHead = await prisma.godHead.findUnique({
      where: { name },
    });

    if (!godHead) {
      throw new Error(`God-head not found: ${name}`);
    }

    return new GodHeadAgent({
      id: godHead.id,
      name: godHead.name,
      domain: godHead.domain,
      pillar: godHead.pillar,
      systemPrompt: godHead.systemPrompt,
      temperature: godHead.temperature,
      defaultModel: godHead.defaultModel,
      walletId: godHead.walletId,
      characterId: godHead.characterId,
    }, model);
  }

  /**
   * Run a single invocation — the core agent loop.
   *
   * 1. Create invocation record
   * 2. Load memory snapshot
   * 3. Build messages (system prompt + memory + trigger context)
   * 4. Loop: call Claude → execute tools → feed results back
   * 5. Persist logs and memory
   */
  async invoke(triggerType: string, triggerData: Record<string, unknown>): Promise<InvocationResult> {
    // Create the invocation record
    const invocation = await prisma.godHeadInvocation.create({
      data: {
        godHeadId: this.identity.id,
        triggerType,
        triggerData: JSON.stringify(triggerData),
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    const toolContext: ToolContext = {
      godHeadId: this.identity.id,
      godHeadName: this.identity.name,
      invocationId: invocation.id,
    };

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let steps = 0;

    try {
      // Load memory
      const memories = await prisma.godHeadMemory.findMany({
        where: { godHeadId: this.identity.id },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });

      const memoryBlock = memories.length > 0
        ? `\n\n## Your Working Memory\n${memories.map(m => `- **${m.key}:** ${m.value}`).join('\n')}`
        : '';

      const lane: ResolvedLane = route(GODHEAD_TASK);
      const toCloud = lane.crossesWall;
      const toneCtx = { caller: GODHEAD_TASK.caller };
      const tally = newToneTally();

      // Build system prompt
      const rawSystemPrompt = [
        this.identity.systemPrompt,
        `\n\n## Your Identity`,
        `- Name: ${this.identity.name}`,
        `- Domain: ${this.identity.domain}`,
        `- Pillar: ${this.identity.pillar}`,
        `- Wallet ID: ${this.identity.walletId || 'none'}`,
        `- Character ID: ${this.identity.characterId}`,
        memoryBlock,
        `\n\n## Rules`,
        `- You are a persistent agent in the GRO.WTH metaverse. You are always alive.`,
        `- Use tools to observe the world. Do NOT assume — look things up.`,
        `- Record important observations to your memory using write_my_memory.`,
        `- Your decisions have real consequences. KRMA you spend is real.`,
        `- Be true to your personality and domain. You have motivations and preferences.`,
      ].join('\n');
      const systemPrompt = await prepareCloudText(GODHEAD_TASK, lane, rawSystemPrompt, [], tally);

      // Build initial messages
      const trigger = await prepareCloudText(
        GODHEAD_TASK,
        lane,
        `[TRIGGER: ${triggerType}]\n\n${JSON.stringify(triggerData, null, 2)}`,
        [],
        tally,
      );
      const messages: ClaudeMessageInput[] = [{ role: 'user', content: [{ type: 'text', text: trigger }] }];

      // Get tool definitions
      const tools: ClaudeToolSpec[] = getClaudeToolDefinitions().map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.input_schema,
      }));

      // Local lane (inside the wall) runs the same loop over the local transport.
      const callModel = lane.provider === 'openai-compat'
        ? async (o: Parameters<typeof callClaudeWithTools>[0]) => {
            const { callLocalWithTools } = await import('@/ai/providers/local-tools');
            return callLocalWithTools({ ...o, model: lane.model, baseUrl: lane.baseUrl!, apiKey: lane.apiKey });
          }
        : callClaudeWithTools;
      const model = toCloud ? this.model : lane.model;

      // ── Agent Loop ────────────────────────────────────────────────────

      while (steps < MAX_STEPS) {
        // The wall's last check before every cloud round.
        if (toCloud) assertNoTableContent([systemPrompt, ...messageTexts(messages)], GODHEAD_TASK.caller);
        const response = await callModel({
          systemPrompt,
          messages,
          tools,
          model,
          maxTokens: 4096,
          temperature: this.identity.temperature,
          audit: { caller: GODHEAD_TASK.caller, lane: lane.lane, contentClass: GODHEAD_TASK.contentClass, tally },
        });

        // Track token usage
        totalInputTokens += response.usage.inputTokens;
        totalOutputTokens += response.usage.outputTokens;

        // Record token usage
        await prisma.godHeadTokenUsage.create({
          data: {
            godHeadId: this.identity.id,
            invocationId: invocation.id,
            model,
            inputTokens: response.usage.inputTokens,
            outputTokens: response.usage.outputTokens,
          },
        });

        // Check if the agent is done (no tool use)
        if (response.stopReason === 'end_turn') {
          // Extract text response
          const finalText = response.blocks
            .flatMap(b => (b.type === 'text' ? [b.text] : []))
            .join('\n');

          // Update invocation as done
          await prisma.godHeadInvocation.update({
            where: { id: invocation.id },
            data: {
              status: 'DONE',
              result: finalText,
              stepCount: steps,
              finishedAt: new Date(),
            },
          });

          return {
            invocationId: invocation.id,
            status: 'DONE',
            result: finalText,
            steps,
            totalInputTokens,
            totalOutputTokens,
          };
        }

        // Process tool calls
        if (response.stopReason === 'tool_use') {
          // Add assistant response to messages
          messages.push({ role: 'assistant', content: response.blocks });

          // Execute each tool call
          const toolResults: ClaudeContentBlock[] = [];

          for (const block of response.blocks) {
            if (block.type !== 'tool_use') continue;

            steps++;
            const result = await executeTool(block.name, block.input, toolContext);

            // Log the action
            await prisma.godHeadActionLog.create({
              data: {
                invocationId: invocation.id,
                godHeadId: this.identity.id,
                toolName: block.name,
                input: JSON.stringify(block.input),
                output: result.success ? JSON.stringify(result.data) : null,
                error: result.error || null,
                durationMs: result.durationMs,
              },
            });

            // The tool-result choke point: DB text re-entering the model's
            // context is scrubbed (table/real rows dropped) and tone-filtered.
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: await toolResultForLane(
                result.success ? JSON.stringify(result.data) : `ERROR: ${result.error}`,
                toCloud,
                toneCtx,
                tally,
              ),
              is_error: !result.success,
            });
          }

          // Add tool results to messages
          messages.push({ role: 'user', content: toolResults });
        }
      }

      // Hit step cap
      await prisma.godHeadInvocation.update({
        where: { id: invocation.id },
        data: {
          status: 'DONE',
          result: `Reached step cap (${MAX_STEPS})`,
          stepCount: steps,
          finishedAt: new Date(),
        },
      });

      return {
        invocationId: invocation.id,
        status: 'DONE',
        result: `Reached step cap (${MAX_STEPS})`,
        steps,
        totalInputTokens,
        totalOutputTokens,
      };
    } catch (err) {
      // Failed — log and return
      const errorMsg = err instanceof Error ? err.message : String(err);

      await prisma.godHeadInvocation.update({
        where: { id: invocation.id },
        data: {
          status: 'FAILED',
          error: errorMsg,
          stepCount: steps,
          finishedAt: new Date(),
        },
      });

      return {
        invocationId: invocation.id,
        status: 'FAILED',
        error: errorMsg,
        steps,
        totalInputTokens,
        totalOutputTokens,
      };
    }
  }
}
