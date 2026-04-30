/**
 * write_my_memory — Persist a key/value note for the invoking agent.
 * Values are stored as JSON strings; objects will be stringified.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  key: z.string().describe('Dot-namespaced key (e.g. "observations.goal_xyz")'),
  valueJson: z.string().describe('Value to store. Pass a JSON-encoded string for structured data, or a plain string.'),
});

registerTool({
  name: 'write_my_memory',
  description: 'Record an observation or note to your own memory. Upserts by key. Use this to persist reasoning, decisions, or running state across invocations.',
  inputSchema,
  handler: async (input, context) => {
    const { key, valueJson } = input as z.infer<typeof inputSchema>;

    const entry = await prisma.godHeadMemory.upsert({
      where: { godHeadId_key: { godHeadId: context.godHeadId, key } },
      update: { value: valueJson },
      create: { godHeadId: context.godHeadId, key, value: valueJson },
    });

    return { key: entry.key, updatedAt: entry.updatedAt.toISOString(), saved: true };
  },
});
