/**
 * Frequency Service — the Deplete operation on Frequency.
 *
 * Per canon (memory: frequency-three-operations + r-2026-07-19-01):
 *   1. **Advance** — the ONLY way max Frequency converts into permanence:
 *                    the trainable→Long-Rest upgrade loop
 *                    (services/advancement.ts, r-2026-07-15-01). TKV-neutral,
 *                    no ledger.
 *   2. **Deplete** — reduces CURRENT pool (damage / cost-paid-now), does NOT
 *                    touch max. Refilled by rest. Lives here.
 *   3. **Burn**    — permanent destruction. Lives in services/burn.ts.
 *
 * The old "Spend" op (max −N + 1:1 FLUID wallet credit) is RETIRED
 * (r-2026-07-19-01): a living character's stats are never a liquidity
 * source. The only stat→wallet conversion in the system is breaking down a
 * spirit package after death.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { broadcastDeathSave } from './death-save';
import type { GrowthCharacter } from '@/types/growth';

export const frequencyOpSchema = z.object({
  characterId: z.string().min(1),
  op: z.enum(['deplete']),
  amount: z.number().int().positive().max(1_000_000),
  reason: z.string().min(1).max(300).optional(),
});

export type FrequencyOpInput = z.infer<typeof frequencyOpSchema>;

export interface FrequencyOpResult {
  op: 'deplete';
  amount: number;
  maxBefore: number;
  maxAfter: number;
  currentBefore: number;
  currentAfter: number;
}

export async function executeFrequencyOp(
  userId: string,
  userRole: string,
  input: FrequencyOpInput,
): Promise<FrequencyOpResult> {
  const validated = frequencyOpSchema.parse(input);

  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Cannot modify this character');
  }

  const next = JSON.parse(character.data) as GrowthCharacter;
  if (!next.attributes?.frequency) {
    throw new ValidationError('Character has no frequency attribute');
  }

  const freq = next.attributes.frequency;
  const maxBefore = freq.level;
  const currentBefore = freq.current;

  // Deplete reduces CURRENT pool only. Floor at 0.
  const currentAfter = Math.max(0, currentBefore - validated.amount);
  freq.current = currentAfter;

  await prisma.character.update({
    where: { id: validated.characterId },
    data: { data: JSON.stringify(next) },
  });

  // T27: crossing into Frequency 0 = Death's Door — surface the Facing
  // Death trigger on the GM screen. The ROLL stays GM-enacted (Tara's
  // choice); this only announces the door opening.
  if (currentBefore > 0 && currentAfter <= 0 && character.campaignId) {
    broadcastDeathSave(character.campaignId, {
      kind: 'death_save',
      phase: 'TRIGGERED',
      characterId: character.id,
      characterName: character.name,
      door: 'COMBAT',
      trigger: 'frequency_zero',
    });
  }

  return {
    op: validated.op,
    amount: validated.amount,
    maxBefore,
    maxAfter: maxBefore,
    currentBefore,
    currentAfter,
  };
}
