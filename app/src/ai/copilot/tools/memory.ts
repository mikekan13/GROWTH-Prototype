/**
 * remember / forget — JEWL's persistent memory tools.
 *
 * JEWL writes notes that survive across conversations. Scope determines
 * visibility:
 *   - 'global'   — visible in every campaign (cross-campaign learning).
 *   - 'campaign' — visible only inside the campaign where it was written
 *                   (key prefixed with `campaign:${campaignId}:` so each
 *                    campaign sees its own namespace).
 *
 * The context assembler loads matching rows on every dispatch and injects
 * them into the system prompt so they're available the next time JEWL
 * reasons. This is the substrate the mistake-bounty design needs to
 * actually CLOSE the learning loop — without persistent notes, every flag
 * is a tax with no upside (see [[jewl-is-the-interface-2026-06-15]]).
 *
 * Per [[forge-chain-recon-2026-06-16]], read_my_memory / write_my_memory
 * already exist for the GodHead dispatcher path. These copilot-runtime
 * tools are the parallel JEWL-runtime path. Same underlying rows, same
 * unique constraint — both writers stay consistent.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getJewlGodHead } from '@/ai/copilot/jewl-identity';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const MEMORY_KEY_MAX = 256;
const MEMORY_VALUE_MAX = 4000;

const memoryScopeSchema = z.enum(['global', 'campaign']);

const rememberInputSchema = z.object({
  key: z.string().min(1).max(MEMORY_KEY_MAX),
  value: z.string().min(1).max(MEMORY_VALUE_MAX),
  scope: memoryScopeSchema.default('global'),
});

const forgetInputSchema = z.object({
  key: z.string().min(1).max(MEMORY_KEY_MAX),
  scope: memoryScopeSchema.default('global'),
});

/**
 * Resolve the storage key from (scope, key, campaignId). Campaign-scoped
 * memories live under a `campaign:${id}:` namespace so the same logical key
 * doesn't collide across campaigns.
 */
export function resolveMemoryStorageKey(
  scope: 'global' | 'campaign',
  key: string,
  campaignId: string,
): string {
  if (scope === 'campaign') return `campaign:${campaignId}:${key}`;
  return key;
}

/** All memory rows JEWL should see in this campaign. */
export interface LoadedJewlMemory {
  storageKey: string;
  displayKey: string;
  scope: 'global' | 'campaign';
  value: string;
  updatedAt: Date;
}

export async function loadJewlMemoryForCampaign(
  campaignId: string,
  limit = 50,
): Promise<LoadedJewlMemory[]> {
  const jewl = await getJewlGodHead();
  const campaignPrefix = `campaign:${campaignId}:`;

  // Fetch all rows for this godhead, filter in-memory for the campaign
  // prefix OR an unprefixed (global) key. Cheap enough for a single godhead
  // until we have thousands of memories — at which point we'd add a real
  // (godHeadId, scope) column. Premature for now.
  const rows = await prisma.godHeadMemory.findMany({
    where: { godHeadId: jewl.godHeadId },
    orderBy: { updatedAt: 'desc' },
    take: 500,
  });

  const out: LoadedJewlMemory[] = [];
  for (const r of rows) {
    if (r.key.startsWith('campaign:')) {
      if (!r.key.startsWith(campaignPrefix)) continue;
      out.push({
        storageKey: r.key,
        displayKey: r.key.slice(campaignPrefix.length),
        scope: 'campaign',
        value: r.value,
        updatedAt: r.updatedAt,
      });
    } else {
      out.push({
        storageKey: r.key,
        displayKey: r.key,
        scope: 'global',
        value: r.value,
        updatedAt: r.updatedAt,
      });
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Format the loaded memories as a system-prompt block. */
export function formatJewlMemoryBlock(memories: LoadedJewlMemory[]): string {
  if (memories.length === 0) {
    return '=== YOUR MEMORY ===\n(empty — write notes with the `remember` tool to keep them across conversations)';
  }
  const lines = ['=== YOUR MEMORY ==='];
  for (const m of memories) {
    const scopeTag = m.scope === 'global' ? '[global]' : '[campaign]';
    lines.push(`${scopeTag} ${m.displayKey}: ${m.value}`);
  }
  return lines.join('\n');
}

// ── Tools ──

export const rememberTool: JewlTool = {
  name: 'remember',
  description:
    'Write a durable note that will be loaded back into your context on every ' +
    'future turn. Use this for: patterns you noticed across sessions, GM ' +
    'preferences you learned, mistake corrections (after a GM_MISTAKE_FLAG), ' +
    'or per-character/per-location facts worth carrying. Scope `global` is ' +
    'visible in every campaign you serve; `campaign` is private to this one. ' +
    'Writing the same key again UPDATES the value (idempotent). Keep keys ' +
    'short and namespace them (e.g. `gm:mike:prefers-terse-summaries`, ' +
    '`mistake-pattern:over-eager-blood-rolls`).',
  inputSchema: rememberInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = rememberInputSchema.parse(input);
    const jewl = await getJewlGodHead();
    const storageKey = resolveMemoryStorageKey(parsed.scope, parsed.key, ctx.campaignId);

    await prisma.godHeadMemory.upsert({
      where: {
        godHeadId_key: { godHeadId: jewl.godHeadId, key: storageKey },
      },
      create: {
        godHeadId: jewl.godHeadId,
        key: storageKey,
        value: parsed.value,
      },
      update: {
        value: parsed.value,
      },
    });

    return {
      output: {
        stored: true,
        scope: parsed.scope,
        key: parsed.key,
        storageKey,
      },
    };
  },
};

export const forgetTool: JewlTool = {
  name: 'forget',
  description:
    'Delete a memory by key + scope. Returns silently if the key did not exist. ' +
    'Use sparingly — outdated memories are usually better UPDATED via `remember` ' +
    'than deleted. Reserve forget for things that were wrong, not things that ' +
    'are merely stale.',
  inputSchema: forgetInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = forgetInputSchema.parse(input);
    const jewl = await getJewlGodHead();
    const storageKey = resolveMemoryStorageKey(parsed.scope, parsed.key, ctx.campaignId);

    const deleted = await prisma.godHeadMemory.deleteMany({
      where: { godHeadId: jewl.godHeadId, key: storageKey },
    });

    return {
      output: {
        removed: deleted.count,
        scope: parsed.scope,
        key: parsed.key,
      },
    };
  },
};

registerJewlTool(rememberTool);
registerJewlTool(forgetTool);
