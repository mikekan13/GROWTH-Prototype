/**
 * Advancement Ops — db wrapper around the pure advancement engine
 * (services/advancement.ts). Loads the character, checks permissions,
 * applies the picks (TKV-neutral, no ledger — r-2026-07-15-01), saves.
 *
 * Kept separate from advancement.ts so the engine stays pure and
 * vitest-testable without a database.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { broadcastEvent } from '@/lib/campaign-stream';
import {
  applyAdvancements,
  AdvancementError,
  type AppliedAdvancement,
} from './advancement';
import type { GrowthCharacter } from '@/types/growth';

export const advancementRequestSchema = z.object({
  characterId: z.string().min(1),
  picks: z.array(z.object({
    kind: z.enum(['attribute', 'skill']),
    name: z.string().min(1),
  })).min(1),
});

export type AdvancementRequest = z.infer<typeof advancementRequestSchema>;

export interface AdvancementOpResult {
  applied: AppliedAdvancement[];
  frequencySpent: number;
  maxFrequencyAfter: number;
  changes: string[];
}

export async function executeAdvancement(
  userId: string,
  userRole: string,
  input: AdvancementRequest,
): Promise<AdvancementOpResult> {
  const validated = advancementRequestSchema.parse(input);

  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Cannot modify this character');
  }

  const charData = JSON.parse(character.data) as GrowthCharacter;

  let result;
  try {
    result = applyAdvancements(charData, validated.picks);
  } catch (err) {
    if (err instanceof AdvancementError) throw new ValidationError(err.message);
    throw err;
  }

  await prisma.character.update({
    where: { id: validated.characterId },
    data: { data: JSON.stringify(result.character) },
  });

  if (character.campaignId) {
    broadcastEvent(character.campaignId, {
      kind: 'character_update',
      characterId: character.id,
      characterName: character.name,
      fields: ['attributes', 'skills'],
    });
  }

  return {
    applied: result.applied,
    frequencySpent: result.frequencySpent,
    maxFrequencyAfter: result.character.attributes.frequency.level,
    changes: result.changes,
  };
}
