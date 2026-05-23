/**
 * Frequency Service — the two non-burn operations on Frequency.
 *
 * Per Mike's canon (memory: frequency-three-operations):
 *   1. **Spend**   — reduces MAX Frequency permanently; credits the character
 *                    wallet 1:1 with FLUID KRMA the GM/player can apply to
 *                    upgrades (attribute bumps, new skills, etc.).
 *   2. **Deplete** — reduces CURRENT pool (damage / cost-paid-now), does NOT
 *                    touch max. Refilled by rest.
 *   3. **Burn**    — permanent destruction. Lives in services/burn.ts.
 *
 * This module owns Spend + Deplete. Burn stays separate because it carries
 * a multiplier-aware preview/execute pair and a system-wide invariant
 * (frozen sink wallet).
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { executeTransaction } from './krma/ledger';
import { getWalletByCharacter, getReserveWallet } from './krma/wallet';
import type { GrowthCharacter } from '@/types/growth';

export const frequencyOpSchema = z.object({
  characterId: z.string().min(1),
  op: z.enum(['spend', 'deplete']),
  amount: z.number().int().positive().max(1_000_000),
  reason: z.string().min(1).max(300).optional(),
});

export type FrequencyOpInput = z.infer<typeof frequencyOpSchema>;

export interface FrequencyOpResult {
  op: 'spend' | 'deplete';
  amount: number;
  maxBefore: number;
  maxAfter: number;
  currentBefore: number;
  currentAfter: number;
  krmaCreditTransactionId: string | null;
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

  let maxAfter = maxBefore;
  let currentAfter = currentBefore;
  let krmaCreditTransactionId: string | null = null;

  if (validated.op === 'spend') {
    // Spend reduces MAX (and pool shifts with it). Anti-zero guard: leave 1
    // min Frequency unless the call is for a death-pathway elsewhere.
    if (maxBefore - validated.amount < 1) {
      throw new ValidationError(`Cannot spend ${validated.amount} — would drop max below 1 (current max: ${maxBefore})`);
    }
    maxAfter = maxBefore - validated.amount;
    // Current can't exceed new max.
    currentAfter = Math.min(currentBefore, maxAfter);
    freq.level = maxAfter;
    freq.current = currentAfter;

    // Credit the character wallet (or fall back to Terminal reserve if the
    // character isn't crystallized yet — in that case no ledger fires).
    try {
      const charWallet = await getWalletByCharacter(validated.characterId);
      const reserveWallet = await getReserveWallet('Terminal');
      const tx = await executeTransaction({
        fromWalletId: reserveWallet.id,
        toWalletId: charWallet.id,
        amount: BigInt(validated.amount),
        state: 'FLUID',
        reason: 'CHARACTER_ADJUST',
        description: `Spend: ${validated.reason ?? 'frequency-to-credit'}`,
        metadata: {
          characterId: validated.characterId,
          op: 'spend',
          maxBefore,
          maxAfter,
        },
        actorId: userId,
        actorType: 'GM',
        idempotencyKey: `freq-spend::${validated.characterId}::${Date.now()}::${validated.amount}`,
      });
      krmaCreditTransactionId = tx.id;
    } catch {
      // No character wallet yet (pre-crystallization) — mechanical spend
      // still happens, ledger waits until the character has a wallet.
    }
  } else {
    // Deplete reduces CURRENT pool only. Floor at 0 (death triggers handled
    // elsewhere via spendAttribute overflow).
    currentAfter = Math.max(0, currentBefore - validated.amount);
    freq.current = currentAfter;
  }

  await prisma.character.update({
    where: { id: validated.characterId },
    data: { data: JSON.stringify(next) },
  });

  return {
    op: validated.op,
    amount: validated.amount,
    maxBefore,
    maxAfter,
    currentBefore,
    currentAfter,
    krmaCreditTransactionId,
  };
}
