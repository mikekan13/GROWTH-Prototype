/**
 * Character Attribute Service — applies attribute-pool changes via the
 * pure `lib/character-actions.ts` functions, persists the result, and
 * reports the change list.
 *
 * This is the SECOND damage path — the Affinity Cycle / attribute-pool
 * reduction. The other path is `services/damage.ts` (body-composition
 * cascade). They serve different roles:
 *  - body damage: limbs / organs / equipment penetration
 *  - attribute damage: Frequency / Focus / Willpower / etc. pool reduction
 *    (Affinity Cycle prices the targeting drift at weapon-authoring)
 *
 * Used by:
 *  - JEWL's `apply_attribute_damage` tool ([[jewl-built-as-we-fix-canvas-2026-06-14]])
 *  - any future direct-attribute mutation surface
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { spendAttribute, updateAttribute, type AttributeName } from '@/lib/character-actions';
import type { GrowthCharacter, GrowthConditions } from '@/types/growth';

export const ATTRIBUTE_NAMES = [
  'clout', 'celerity', 'constitution',
  'flow', 'frequency', 'focus',
  'willpower', 'wisdom', 'wit',
] as const;

export const applyAttributeDamageSchema = z.object({
  characterId: z.string().min(1),
  amount: z.number().int().min(1),
  targetAttribute: z.enum(ATTRIBUTE_NAMES),
  damageType: z
    .enum(['piercing', 'slashing', 'bashing', 'heat', 'cold', 'decay', 'energy'])
    .optional(),
  note: z.string().max(500).optional(),
});

export interface ApplyAttributeDamageResult {
  characterId: string;
  characterData: GrowthCharacter;
  changes: string[];
  /** True if Frequency reached 0 — caller may chain a death trigger. */
  frequencyDepleted: boolean;
}

export async function applyAttributeDamage(
  actorUserId: string,
  actorRole: string,
  input: z.infer<typeof applyAttributeDamageSchema>,
): Promise<ApplyAttributeDamageResult> {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Only the GM (or admin) can apply attribute damage');
  }

  let charData: GrowthCharacter;
  try {
    charData = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    throw new ValidationError('Invalid character data — cannot apply damage');
  }

  const result = spendAttribute(
    charData,
    input.targetAttribute as AttributeName,
    input.amount,
  );

  await prisma.character.update({
    where: { id: input.characterId },
    data: { data: JSON.stringify(result.character) },
  });

  // Mirror Fable's damage panel: log to the campaign event stream so the
  // existing replay surfaces show it. JEWL will additionally write a
  // CopilotMessage triple via the runtime.
  if (character.campaignId) {
    const actor = await prisma.user.findUnique({
      where: { id: actorUserId },
      select: { username: true },
    });
    await prisma.campaignEvent.create({
      data: {
        campaignId: character.campaignId,
        type: 'damage',
        actor: 'gm',
        actorUserId,
        actorName: actor?.username ?? 'GM',
        characterId: input.characterId,
        characterName: character.name,
        payload: JSON.stringify({
          mode: 'attribute',
          targetAttribute: input.targetAttribute,
          damageType: input.damageType,
          amount: input.amount,
          note: input.note,
          changes: result.changes,
        }),
      },
    }).catch(() => { /* swallow logging failure */ });
  }

  const freqCurrent = result.character.attributes?.frequency?.current ?? 1;
  return {
    characterId: input.characterId,
    characterData: result.character,
    changes: result.changes,
    frequencyDepleted: freqCurrent <= 0,
  };
}

// ── Heal / set attribute pool ─────────────────────────────────────────────

export const setAttributeCurrentSchema = z.object({
  characterId: z.string().min(1),
  attribute: z.enum(ATTRIBUTE_NAMES),
  /** Absolute new value. Clamped to [0, max] where max is the attribute's
   *  level + augments. Use to heal, drain, or set; this is NOT the damage
   *  path (that's applyAttributeDamage and respects overflow rules). */
  current: z.number().int().min(0),
  note: z.string().max(500).optional(),
});

export async function setAttributeCurrent(
  actorUserId: string,
  actorRole: string,
  input: z.infer<typeof setAttributeCurrentSchema>,
): Promise<{ characterId: string; characterData: GrowthCharacter; changes: string[] }> {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Only the GM (or admin) can set attribute values');
  }

  let charData: GrowthCharacter;
  try {
    charData = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    throw new ValidationError('Invalid character data');
  }

  const attr = charData.attributes?.[input.attribute as AttributeName];
  if (!attr) {
    throw new ValidationError(`Attribute ${input.attribute} not present on character`);
  }
  // Frequency has no augments — its max is just `level`. The other eight
  // attributes track augments separately.
  const augPos = 'augmentPositive' in attr ? attr.augmentPositive : 0;
  const augNeg = 'augmentNegative' in attr ? attr.augmentNegative : 0;
  const max = attr.level + (augPos || 0) - (augNeg || 0);
  const clamped = Math.min(Math.max(0, input.current), Math.max(0, max));
  const result = updateAttribute(charData, input.attribute as AttributeName, clamped);

  await prisma.character.update({
    where: { id: input.characterId },
    data: { data: JSON.stringify(result.character) },
  });

  return {
    characterId: input.characterId,
    characterData: result.character,
    changes: [
      `${input.attribute} current → ${clamped}${clamped !== input.current ? ` (clamped from ${input.current})` : ''}`,
      ...result.changes,
    ],
  };
}

// ── Condition toggle ──────────────────────────────────────────────────────

export const CONDITION_NAMES = [
  'weak', 'clumsy', 'exhausted',
  'deafened', 'deathsDoor', 'muted',
  'overwhelmed', 'confused', 'incoherent',
] as const;

export const setCharacterConditionSchema = z.object({
  characterId: z.string().min(1),
  condition: z.enum(CONDITION_NAMES),
  active: z.boolean(),
  note: z.string().max(500).optional(),
});

function defaultConditions(): GrowthConditions {
  return {
    weak: false, clumsy: false, exhausted: false,
    deafened: false, deathsDoor: false, muted: false,
    overwhelmed: false, confused: false, incoherent: false,
  };
}

export async function setCharacterCondition(
  actorUserId: string,
  actorRole: string,
  input: z.infer<typeof setCharacterConditionSchema>,
): Promise<{ characterId: string; characterData: GrowthCharacter; changes: string[] }> {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Only the GM (or admin) can toggle conditions');
  }

  let charData: GrowthCharacter;
  try {
    charData = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    throw new ValidationError('Invalid character data');
  }

  const conditions = { ...defaultConditions(), ...(charData.conditions ?? {}) };
  const was = conditions[input.condition];
  if (was === input.active) {
    return {
      characterId: input.characterId,
      characterData: charData,
      changes: [`${input.condition} already ${input.active ? 'active' : 'inactive'} — no change`],
    };
  }
  conditions[input.condition] = input.active;
  const next: GrowthCharacter = { ...charData, conditions };

  await prisma.character.update({
    where: { id: input.characterId },
    data: { data: JSON.stringify(next) },
  });

  return {
    characterId: input.characterId,
    characterData: next,
    changes: [`${input.condition} → ${input.active ? 'ACTIVE' : 'cleared'}`],
  };
}
