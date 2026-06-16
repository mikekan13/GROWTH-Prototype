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
import { spendAttribute, type AttributeName } from '@/lib/character-actions';
import type { GrowthCharacter } from '@/types/growth';

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
