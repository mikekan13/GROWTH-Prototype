/**
 * read_my_memory — Retrieve the invoking agent's own working memory.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  key: z.string().describe('Exact key to fetch. Omit to list all keys.').optional(),
  keyPrefix: z.string().describe('Fetch all entries whose key starts with this prefix (e.g. "observations.kai.")').optional(),
});

registerTool({
  name: 'read_my_memory',
  description: 'Read your own working memory. Pass `key` for a single entry, `keyPrefix` for a namespace, or nothing to list all keys you have stored.',
  inputSchema,
  handler: async (input, context) => {
    const { key, keyPrefix } = input as z.infer<typeof inputSchema>;

    if (key) {
      const entry = await prisma.godHeadMemory.findUnique({
        where: { godHeadId_key: { godHeadId: context.godHeadId, key } },
      });
      if (!entry) return { key, found: false };
      let value: unknown = entry.value;
      try {
        value = JSON.parse(entry.value);
      } catch {
        /* leave as string */
      }
      return { key, found: true, value, updatedAt: entry.updatedAt.toISOString() };
    }

    if (keyPrefix) {
      const entries = await prisma.godHeadMemory.findMany({
        where: { godHeadId: context.godHeadId, key: { startsWith: keyPrefix } },
        orderBy: { updatedAt: 'desc' },
      });
      return {
        keyPrefix,
        count: entries.length,
        entries: entries.map(e => {
          let v: unknown = e.value;
          try {
            v = JSON.parse(e.value);
          } catch {
            /* leave as string */
          }
          return { key: e.key, value: v, updatedAt: e.updatedAt.toISOString() };
        }),
      };
    }

    const all = await prisma.godHeadMemory.findMany({
      where: { godHeadId: context.godHeadId },
      select: { key: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    return {
      count: all.length,
      keys: all.map(e => ({ key: e.key, updatedAt: e.updatedAt.toISOString() })),
    };
  },
});
