/**
 * daya_ledger_read — JEWL inspection tool: an entity's raw meta-memory ledger.
 *
 * Part of the persona-harness observation surface (Addendum C: "the Debug
 * Console IS JEWL" — there is no standalone console, JEWL's own interface
 * reads persona-harness state). READ-ONLY: lists DayaMemoryEntry rows for a
 * character's persona-harness entity, unfiltered by fidelity/bias — this is
 * the raw archive, not what the entity itself can recall (that's
 * `daya_recall_probe`). GM/ADMIN only; a lesser actor gets a refusal, never
 * a peek (mirrors the JEWL-identity/wallet-private masking convention).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  revealed: false,
  reason: 'Not authorized to inspect persona-harness state.',
};

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const ledgerFilterSchema = z.object({
  source: z.string().max(64).optional(),
  sinceCycle: z.number().optional(),
  minSalience: z.number().min(0).max(1).optional(),
  limit: z.number().int().positive().max(100).optional(),
});

const dayaLedgerReadInputSchema = z.object({
  characterId: z.string().min(1),
  filter: ledgerFilterSchema.optional(),
});

export const dayaLedgerReadTool: JewlTool = {
  name: 'daya_ledger_read',
  description:
    'GM/ADMIN-only inspection tool. Reads the raw meta-memory ledger ' +
    '(DayaMemoryEntry rows) for a persona-harness entity — content, source, ' +
    'narrative cycle, valence/arousal/salience, classification tags, and ' +
    'cluster grouping. This is the full archive as recorded, NOT what the ' +
    'entity can currently recall (fidelity/mood/Thorn gating happens in ' +
    'daya_recall_probe). Optional filter: source, sinceCycle, minSalience, ' +
    'limit (default 20, max 100). Read-only — never writes anything.',
  inputSchema: dayaLedgerReadInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaLedgerReadInputSchema.parse(input);
    const filter = parsed.filter ?? {};

    const entity = await prisma.dayaEntity.findUnique({
      where: { characterId: parsed.characterId },
      select: { id: true },
    });
    if (!entity) {
      return { output: { revealed: true, entityFound: false, memories: [] } };
    }

    const where: {
      entityId: string;
      source?: string;
      narrativeCycle?: { gte: number };
      salience?: { gte: number };
    } = { entityId: entity.id };
    if (filter.source) where.source = filter.source;
    if (filter.sinceCycle !== undefined) where.narrativeCycle = { gte: filter.sinceCycle };
    if (filter.minSalience !== undefined) where.salience = { gte: filter.minSalience };

    const limit = Math.min(filter.limit ?? 20, 100);

    const rows = await prisma.dayaMemoryEntry.findMany({
      where,
      orderBy: { narrativeCycle: 'desc' },
      take: limit,
    });

    return {
      output: {
        revealed: true,
        entityFound: true,
        count: rows.length,
        memories: rows.map((r) => ({
          id: r.id,
          content: r.content,
          source: r.source,
          cycle: r.narrativeCycle,
          valence: r.valence,
          arousal: r.arousal,
          salience: r.salience,
          entityRefs: safeParseJson(r.entityRefs),
          classification: safeParseJson(r.classification),
          clusterId: r.clusterId,
          parentMemoryId: r.parentMemoryId,
        })),
      },
    };
  },
};

registerJewlTool(dayaLedgerReadTool);
