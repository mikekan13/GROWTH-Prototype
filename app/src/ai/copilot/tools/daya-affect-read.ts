/**
 * daya_affect_read — JEWL inspection tool: an entity's current mood, plainly.
 *
 * Part of the persona-harness observation surface (Addendum C). READ-ONLY:
 * reads the DayaAffect vector (morale/stress/grief) plus the same
 * `renderDispositionLine` prompt-assembly uses, plus recent drive-moving
 * beats pulled from the HistoryEntry rows `services/daya-affect.ts` already
 * writes on every disposition event. GM/ADMIN only.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';
import { renderDispositionLine } from '@/services/daya-affect';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  revealed: false,
  reason: 'Not authorized to inspect persona-harness state.',
};

function safeParseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

const dayaAffectReadInputSchema = z.object({
  characterId: z.string().min(1),
  /** Max recent history beats to include. Default 10, hard ceiling 50. */
  recentLimit: z.number().int().positive().max(50).optional(),
});

export const dayaAffectReadTool: JewlTool = {
  name: 'daya_affect_read',
  description:
    'GM/ADMIN-only inspection tool. Reads a persona-harness entity\'s ' +
    'current DayaAffect vector (morale/stress/grief), the plain-English ' +
    'disposition line prompt-assembly would render, and recent affect-moving ' +
    'beats (from the HistoryEntry trail every disposition event writes). Her ' +
    'mood, plainly — not a roleplay of it. Read-only — never writes anything.',
  inputSchema: dayaAffectReadInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaAffectReadInputSchema.parse(input);

    const entity = await prisma.dayaEntity.findUnique({
      where: { characterId: parsed.characterId },
      select: { id: true },
    });
    if (!entity) {
      return { output: { revealed: true, entityFound: false, drives: null } };
    }

    const affect = await prisma.dayaAffect.findUnique({ where: { entityId: entity.id } });
    const drives = affect
      ? { morale: affect.morale, stress: affect.stress, grief: affect.grief, lastCycle: affect.lastCycle }
      : null;
    const dispositionLine = renderDispositionLine(drives ? { morale: drives.morale, stress: drives.stress, grief: drives.grief } : null);

    const limit = parsed.recentLimit ?? 10;
    const recentBeats = await prisma.historyEntry.findMany({
      where: { subjectId: parsed.characterId, subjectType: 'character', type: 'narrative_event' },
      orderBy: { realTime: 'desc' },
      take: limit,
    });

    return {
      output: {
        revealed: true,
        entityFound: true,
        drives,
        dispositionLine,
        recentDeltas: recentBeats.map((b) => ({
          cycle: b.timestampCycle,
          summary: b.summary,
          details: safeParseJson(b.details),
          at: b.realTime.toISOString(),
        })),
      },
    };
  },
};

registerJewlTool(dayaAffectReadTool);
