/**
 * route_to_godhead — Eth'erling's orchestration tool.
 *
 * Eth'erling is the orchestrator: she receives complex requests from the
 * GM, decides which specialist godhead should handle each part, and
 * synthesizes the responses back. This tool fires a sub-invocation of
 * another godhead and returns the result for Eth'erling to synthesize.
 *
 * Implementation: we instantiate a GodHeadAgent for the target godhead
 * and call .invoke() inline. The sub-invocation is fully tracked in
 * GodHeadInvocation as a normal invocation, with the parentInvocationId
 * stored on relationshipTags (no schema column for it yet).
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool, type ToolContext } from './registry';
import { GodHeadAgent } from '../agent';

const inputSchema = z.object({
  godheadName: z.string().describe('Name of the godhead to invoke (e.g. "Kai", "Tara Almswood")'),
  triggerType: z.string().describe('Synthetic trigger label, e.g. "delegated.evaluate_blueprint" or "goal.completed"'),
  // Models frequently pass stringified JSON for record args — accept both
  // (the strict version cost Et'herling four failed routing attempts in
  // the first live T32 run).
  payload: z.preprocess(
    (v) => {
      if (typeof v === 'string') {
        try { return JSON.parse(v) as unknown; } catch { return v; }
      }
      return v;
    },
    z.record(z.string(), z.unknown()),
  ).describe('Payload to forward to the sub-agent (object, or JSON string of one)'),
});

/** Epithets agents naturally use → GodHead.name DB values. */
const NAME_ALIASES: Record<string, string> = {
  'lady death': 'Tara Almswood',
  'tara': 'Tara Almswood',
  'etherling': "Eth'erling",
  "eth'erling": "Eth'erling",
};

registerTool({
  name: 'route_to_godhead',
  description: 'Eth\'erling: delegate a sub-task to another godhead. Returns the sub-agent\'s final response. Useful for orchestrating goal/blueprint flows that need Kai or Lady Death\'s specialty.',
  inputSchema,
  handler: async (input, context: ToolContext) => {
    const { godheadName: rawName, triggerType, payload } = input as z.infer<typeof inputSchema>;
    const godheadName = NAME_ALIASES[rawName.toLowerCase()] ?? rawName;
    if (godheadName === context.godHeadName) {
      throw new Error('Cannot route to self');
    }
    const target = await prisma.godHead.findUnique({ where: { name: godheadName } });
    if (!target) throw new Error(`Target godhead not found: ${godheadName}`);

    const agent = await GodHeadAgent.load(godheadName);
    const augmented = { ...payload, _parentInvocationId: context.invocationId, _parentGodhead: context.godHeadName };
    const result = await agent.invoke(triggerType, augmented);

    return {
      godhead: godheadName,
      invocationId: result.invocationId,
      status: result.status,
      result: result.result ?? null,
      error: result.error ?? null,
    };
  },
});
