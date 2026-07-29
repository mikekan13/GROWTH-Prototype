/**
 * daya_routing_log — JEWL inspection tool: the model-call cost/routing trail.
 *
 * Part of the persona-harness observation surface (Addendum C). READ-ONLY:
 * lists DayaModelCall rows (every subsystem's `chat()` call writes one — see
 * `daya/model-client.ts`) with an aggregate cost-per-entity-hour rollup, the
 * Phase-1 exit test 7 economics readout. GM/ADMIN only.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';
import { tierAvailability } from '@/daya/model-client';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  revealed: false,
  reason: 'Not authorized to inspect persona-harness state.',
};

const dayaRoutingLogInputSchema = z.object({
  characterId: z.string().min(1).optional(),
  subsystem: z.string().max(64).optional(),
  sinceMinutes: z.number().positive().optional(),
  limit: z.number().int().positive().max(200).optional(),
});

export const dayaRoutingLogTool: JewlTool = {
  name: 'daya_routing_log',
  description:
    'GM/ADMIN-only inspection tool. Lists DayaModelCall rows (tier, ' +
    'subsystem, model, tokensIn/Out, usd, sanitized flag, content-free ' +
    'rationale) — every model call any persona-harness subsystem made, ' +
    'optionally scoped to one entity/subsystem/time window. Also returns a ' +
    'cost-per-entity-hour rollup and current tier availability. Read-only — ' +
    'never writes anything.',
  inputSchema: dayaRoutingLogInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaRoutingLogInputSchema.parse(input);

    let entityId: string | undefined;
    if (parsed.characterId) {
      const entity = await prisma.dayaEntity.findUnique({
        where: { characterId: parsed.characterId },
        select: { id: true },
      });
      if (!entity) {
        return { output: { revealed: true, entityFound: false, calls: [], rollup: null, tierAvailability: tierAvailability() } };
      }
      entityId = entity.id;
    }

    const where: { entityId?: string; subsystem?: string; createdAt?: { gte: Date } } = {};
    if (entityId) where.entityId = entityId;
    if (parsed.subsystem) where.subsystem = parsed.subsystem;
    if (parsed.sinceMinutes !== undefined) {
      where.createdAt = { gte: new Date(Date.now() - parsed.sinceMinutes * 60_000) };
    }

    const limit = Math.min(parsed.limit ?? 50, 200);

    const [rows, aggregate] = await Promise.all([
      prisma.dayaModelCall.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit }),
      prisma.dayaModelCall.aggregate({
        where,
        _sum: { usd: true, tokensIn: true, tokensOut: true },
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
      }),
    ]);

    const totalUsd = aggregate._sum.usd ?? 0;
    const earliest = aggregate._min.createdAt;
    const latest = aggregate._max.createdAt;
    const hoursSpan = earliest && latest ? Math.max(0, (latest.getTime() - earliest.getTime()) / 3_600_000) : 0;
    const costPerHour = hoursSpan > 0 ? totalUsd / hoursSpan : null;

    return {
      output: {
        revealed: true,
        entityFound: parsed.characterId ? true : undefined,
        count: rows.length,
        calls: rows.map((r) => ({
          id: r.id,
          tier: r.tier,
          subsystem: r.subsystem,
          model: r.model,
          tokensIn: r.tokensIn,
          tokensOut: r.tokensOut,
          usd: r.usd,
          sanitized: r.sanitized,
          rationale: r.rationale,
          createdAt: r.createdAt.toISOString(),
        })),
        rollup: {
          matchedCalls: aggregate._count._all,
          totalUsd,
          totalTokensIn: aggregate._sum.tokensIn ?? 0,
          totalTokensOut: aggregate._sum.tokensOut ?? 0,
          hoursSpan,
          costPerEntityHour: costPerHour,
        },
        tierAvailability: tierAvailability(),
      },
    };
  },
};

registerJewlTool(dayaRoutingLogTool);
