/**
 * release_goal — God-head relinquishes custodianship of a GRO.vine.
 * Only the current custodian can release.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  goalId: z.string().describe('The goal to release'),
  reasoning: z.string().describe('Why you are releasing custodianship'),
});

registerTool({
  name: 'release_goal',
  description: 'Give up custodianship of a goal you currently custody. Clears custodian fields so another god-head (or none) can adopt it.',
  inputSchema,
  handler: async (input, context) => {
    const { goalId, reasoning } = input as z.infer<typeof inputSchema>;

    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    if (!goal) throw new Error(`Goal not found: ${goalId}`);
    if (goal.custodianId !== context.godHeadId) {
      throw new Error(`You are not the custodian of this goal (current: ${goal.custodianId ?? 'none'})`);
    }

    const updated = await prisma.goal.update({
      where: { id: goalId },
      data: { custodianId: null, custodianName: null, pillar: null },
    });

    await prisma.godHeadMemory.upsert({
      where: {
        godHeadId_key: {
          godHeadId: context.godHeadId,
          key: `custodianship.${goalId}.released`,
        },
      },
      update: { value: JSON.stringify({ reasoning, releasedAt: new Date().toISOString() }) },
      create: {
        godHeadId: context.godHeadId,
        key: `custodianship.${goalId}.released`,
        value: JSON.stringify({ reasoning, releasedAt: new Date().toISOString() }),
      },
    });

    return { goalId: updated.id, released: true };
  },
});
