/**
 * propose_resistance — Write a resistance proposal to the GM via
 * Goal.resistancePrompt. The GM sees the prompt in the Tapestry and
 * responds by filling Goal.resistancePlan (or ignoring it).
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  goalId: z.string().describe('The goal to propose resistance against'),
  plan: z.string().describe('Plain-language proposal for obstacles, antagonists, or complications the GM should consider. Will be shown to the GM verbatim.'),
});

registerTool({
  name: 'propose_resistance',
  description: 'Write a resistance proposal for a goal. Sets Goal.resistancePrompt for the GM to review. Use this when you want to nudge a campaign toward obstacles that fit your domain.',
  inputSchema,
  handler: async (input, context) => {
    const { goalId, plan } = input as z.infer<typeof inputSchema>;

    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      select: { id: true, status: true, custodianId: true },
    });
    if (!goal) throw new Error(`Goal not found: ${goalId}`);
    if (goal.status !== 'ACTIVE') {
      throw new Error(`Cannot propose resistance on goal in status ${goal.status}`);
    }

    const authorTag = `[${context.godHeadName}]`;
    const stamped = `${authorTag} ${plan}`;

    const updated = await prisma.goal.update({
      where: { id: goalId },
      data: { resistancePrompt: stamped },
    });

    return {
      goalId: updated.id,
      resistancePrompt: updated.resistancePrompt,
      proposedBy: context.godHeadName,
    };
  },
});
