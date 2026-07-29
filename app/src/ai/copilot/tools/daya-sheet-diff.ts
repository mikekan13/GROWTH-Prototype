/**
 * daya_sheet_diff — JEWL inspection tool: True Sheet vs Believed Sheet.
 *
 * Part of the persona-harness observation surface (Addendum C). READ-ONLY:
 * pulls the engine-true attribute pools straight off `Character.data` and
 * the entity's fuzzy/possibly-wrong mirror off `DayaBelievedSheet.data`
 * (WP5's `pool.<attribute>` subjectKey convention), side by side, so Mike
 * can see divergence per stat plus introspection/bias context. Divergence is
 * a FEATURE of the persona harness (an arrogant profile should read believed
 * > true) — this is exactly the inspection view Phase-1 exit test 5 needs.
 * GM/ADMIN only. Deliberately reads `DayaBelievedSheet` directly rather than
 * through `renderer.ts`'s `getBelievedValue()` (which resolves the entity id
 * via an upserting helper) — this handler never upserts, so it never writes.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';
import { SKILL_GOVERNORS, type SkillGovernor, type GrowthCharacter } from '@/types/growth';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  revealed: false,
  reason: 'Not authorized to inspect persona-harness state.',
};

function safeParseSheet(raw: string | null | undefined): Partial<GrowthCharacter> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<GrowthCharacter>) : null;
  } catch {
    return null;
  }
}

interface BelievedSheetData {
  _epochs?: Record<string, number>;
  [key: string]: unknown;
}

function parseBelievedData(raw: string | null | undefined): BelievedSheetData {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as BelievedSheetData) : {};
  } catch {
    return {};
  }
}

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function parsePersonaProfile(raw: string): { bias?: Record<string, number>; voice?: Record<string, unknown> } {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

const dayaSheetDiffInputSchema = z.object({
  characterId: z.string().min(1),
});

export const dayaSheetDiffTool: JewlTool = {
  name: 'daya_sheet_diff',
  description:
    'GM/ADMIN-only inspection tool. Shows True Sheet (engine-exact, from ' +
    'Character.data) vs Believed Sheet (the entity\'s own fuzzy/possibly-' +
    'wrong mirror, from DayaBelievedSheet.data) side by side per attribute ' +
    'pool, plus introspection (self-insight capacity) and the bias profile ' +
    'shaping the divergence. Divergence between true and believed is by ' +
    'design, not a bug — an arrogant profile should read believed > true. ' +
    'Read-only — never writes anything, never triggers a revision.',
  inputSchema: dayaSheetDiffInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaSheetDiffInputSchema.parse(input);

    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: parsed.characterId } });
    if (!entity) {
      return { output: { revealed: true, entityFound: false, attributes: [] } };
    }

    const [character, believedSheet] = await Promise.all([
      prisma.character.findUnique({ where: { id: parsed.characterId }, select: { data: true } }),
      prisma.dayaBelievedSheet.findUnique({ where: { entityId: entity.id } }),
    ]);

    const sheet = safeParseSheet(character?.data);
    const believedData = parseBelievedData(believedSheet?.data);
    const persona = parsePersonaProfile(entity.personaProfile);

    const attributes = (SKILL_GOVERNORS as SkillGovernor[]).map((attr) => {
      const trueAttr = sheet?.attributes?.[attr];
      const trueCurrent = trueAttr?.current;
      const trueMax = trueAttr ? trueAttr.level + trueAttr.augmentPositive - trueAttr.augmentNegative : undefined;
      const believedCurrentRaw = getAtPath(believedData, `pool.${attr}`);
      const believedCurrent = typeof believedCurrentRaw === 'number' ? believedCurrentRaw : undefined;
      const divergence =
        believedCurrent !== undefined && trueCurrent !== undefined ? believedCurrent - trueCurrent : null;

      return {
        attribute: attr,
        trueCurrent: trueCurrent ?? null,
        trueMax: trueMax ?? null,
        believedCurrent: believedCurrent ?? null,
        divergence,
        hasRevision: believedCurrent !== undefined,
      };
    });

    const frequency = sheet?.attributes?.frequency;

    return {
      output: {
        revealed: true,
        entityFound: true,
        introspection: entity.introspection,
        biasProfile: persona.bias ?? {},
        attributes,
        frequency: frequency ? { trueCurrent: frequency.current, trueMax: frequency.level } : null,
        revisionEpochs: believedData._epochs ?? {},
        believedSheetLastRevisedAt: believedSheet?.lastRevisedAt?.toISOString() ?? null,
      },
    };
  },
};

registerJewlTool(dayaSheetDiffTool);
