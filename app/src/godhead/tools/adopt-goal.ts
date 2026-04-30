/**
 * adopt_goal — God-head claims custodianship of a GRO.vine.
 *
 * Sets Goal.custodianId / custodianName / pillar to the invoking
 * god-head. Refuses if another god-head already custodies the goal.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  goalId: z.string().describe('The goal to adopt'),
  reasoning: z.string().describe('Why you are adopting this — recorded in your memory alongside the claim'),
});

registerTool({
  name: 'adopt_goal',
  description: 'Claim custodianship of a GRO.vine. Only available if the goal is unclaimed. Your pillar is inherited from your god-head row.',
  inputSchema,
  handler: async (input, context) => {
    const { goalId, reasoning } = input as z.infer<typeof inputSchema>;

    const [goal, godhead] = await Promise.all([
      prisma.goal.findUnique({ where: { id: goalId } }),
      prisma.godHead.findUnique({
        where: { id: context.godHeadId },
        select: { id: true, name: true, pillar: true },
      }),
    ]);

    if (!goal) throw new Error(`Goal not found: ${goalId}`);
    if (!godhead) throw new Error(`God-head not found: ${context.godHeadId}`);
    if (goal.status !== 'ACTIVE') {
      throw new Error(`Cannot adopt goal in status ${goal.status}`);
    }
    if (goal.custodianId && goal.custodianId !== godhead.id) {
      throw new Error(
        `Goal already claimed by ${goal.custodianName ?? goal.custodianId}. Ask them to release it first.`,
      );
    }

    const updated = await prisma.goal.update({
      where: { id: goalId },
      data: {
        custodianId: godhead.id,
        custodianName: godhead.name,
        pillar: godhead.pillar,
      },
    });

    // Record the reasoning in memory so the decision persists.
    await prisma.godHeadMemory.upsert({
      where: {
        godHeadId_key: {
          godHeadId: godhead.id,
          key: `custodianship.${goalId}.adopted`,
        },
      },
      update: { value: JSON.stringify({ reasoning, adoptedAt: new Date().toISOString() }) },
      create: {
        godHeadId: godhead.id,
        key: `custodianship.${goalId}.adopted`,
        value: JSON.stringify({ reasoning, adoptedAt: new Date().toISOString() }),
      },
    });

    return {
      goalId: updated.id,
      custodianId: updated.custodianId,
      custodianName: updated.custodianName,
      pillar: updated.pillar,
    };
  },
});
