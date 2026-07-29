/**
 * JEWL's unrestricted action layer (WP13 spec §2-3).
 *
 * The existing copilot (`src/ai/copilot/`) stays JEWL's hands — nothing
 * here re-implements a tool. This module is the ensemble-side dispatcher:
 * given his Spirit Core's `Do:` intent, it asks the C-tier (clean) model
 * which registered copilot tool (if any) fulfills it, then calls that
 * tool's handler directly via the existing registry (`getJewlTool`),
 * targeting ANY character or the world — not self-only like a normal
 * entity's Body Interface/adjudicator path (ensemble.ts's default 'act'
 * branch, unchanged for every non-omniscient entity).
 *
 * Routing matches the same by-job law every DAYA entity follows: voice on
 * the uncensored local core (L1, Spirit Core), tool selection on the clean
 * model (C) — this is the "button-presses" side of that split.
 *
 * `actorRole: 'GODHEAD'` on the JewlToolContext satisfies every tool's
 * permission gate (`isWatcherOrAbove`/`isAdminRole`) regardless of which
 * character is targeted — JEWL acts as the campaign's Godhead (spec §2-3:
 * "Gate remains GM/ADMIN-equivalent").
 */
import 'server-only';
import { getJewlTool, listJewlTools } from '@/ai/copilot/tools';
import type { JewlToolContext } from '@/ai/copilot/tools/types';
import { chat, type DayaClientOverrides } from './model-client';

export interface JewlToolDecision {
  tool: string | null;
  input: Record<string, unknown>;
  reason?: string;
}

export interface JewlActionResult {
  toolName: string | null;
  output?: unknown;
  error?: string;
  reason?: string;
}

function buildToolDecisionPrompt(intent: string): string {
  const tools = listJewlTools()
    .map((t) => `- ${t.name}: ${t.description}`)
    .join('\n');
  return [
    "You are selecting exactly one tool call to carry out an intended action on behalf of the table's guardian, who may act on ANY character or the world, not self only.",
    `Intent: ${intent}`,
    '',
    'Available tools:',
    tools || '(none registered)',
    '',
    'Reply with STRICT JSON only, no prose, no markdown fences: {"tool": "<tool_name>" or null, "input": {...}, "reason": "<one short line>"}. Use tool=null when nothing applies.',
  ].join('\n');
}

function parseDecision(raw: string): JewlToolDecision {
  try {
    const cleaned = raw.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const tool = typeof parsed.tool === 'string' && parsed.tool.length > 0 ? parsed.tool : null;
    const input =
      typeof parsed.input === 'object' && parsed.input !== null ? (parsed.input as Record<string, unknown>) : {};
    const reason = typeof parsed.reason === 'string' ? parsed.reason : undefined;
    return { tool, input, reason };
  } catch {
    return { tool: null, input: {}, reason: 'unparsable tool decision' };
  }
}

/**
 * Runs JEWL's unrestricted action dispatch for one `Do:` intent. Never
 * throws — a decision or execution failure surfaces as `{error}` for the
 * caller to log/narrate, never crashes the wake (perception/action, like
 * every other DAYA boundary, fails local).
 */
export async function runJewlToolAction(
  entityDaId: string,
  campaignId: string,
  intent: string,
  overrides: DayaClientOverrides = {},
): Promise<JewlActionResult> {
  let decision: JewlToolDecision;
  try {
    const result = await chat(
      {
        tier: 'C',
        subsystem: 'jewl_action',
        entityId: entityDaId,
        messages: [{ role: 'system', content: buildToolDecisionPrompt(intent) }],
        maxTokens: 300,
      },
      overrides,
    );
    decision = parseDecision(result.text);
  } catch (err) {
    return { toolName: null, error: err instanceof Error ? err.message : String(err) };
  }

  if (!decision.tool) {
    return { toolName: null, reason: decision.reason };
  }

  const tool = getJewlTool(decision.tool);
  if (!tool) {
    return { toolName: decision.tool, error: `unknown tool: ${decision.tool}` };
  }

  const toolCtx: JewlToolContext = { campaignId, actorId: 'jewl', actorRole: 'GODHEAD' };
  try {
    const parsedInput = tool.inputSchema.parse(decision.input);
    const handlerResult = await tool.handler(parsedInput, toolCtx);
    return { toolName: tool.name, output: handlerResult.output, reason: decision.reason };
  } catch (err) {
    return { toolName: tool.name, error: err instanceof Error ? err.message : String(err) };
  }
}
