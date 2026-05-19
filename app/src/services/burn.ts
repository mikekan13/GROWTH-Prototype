/**
 * Burn Service — permanent KRMA removal from the metaverse.
 *
 * Canon (Mike, 2026-05-19):
 *   - "Burning" is literal: KRMA permanently exits the entire system.
 *   - Cost is denominated in KRMA at a 1:1 rate against the character's
 *     **max Frequency**. Burning N KRMA reduces the character's max
 *     Frequency by N (permanently — not the current pool, the max).
 *   - The cost of a desired outcome is judged by a high-level Godhead
 *     (Kai today; possibly Terminal-tier later) based on:
 *       (a) the narrative scale of what the player is asking for
 *       (b) the system-wide total of KRMA already burned
 *   - Anti-deflationary: as more KRMA is burned across the metaverse,
 *     future burns cost more. Roughly: 1 KRMA today → ~2 KRMA at year 2.
 *
 * Cost formula:
 *     scaledCost = baseCost × (1 + burnSinkBalance / BURN_SCALE_CONSTANT)
 *
 * BURN_SCALE_CONSTANT is calibrated against an expected year-1 burn flux
 * — we want the multiplier to drift from ~1.0 toward ~2.0 across year 2.
 * Tunable below; the GM and Terminal Admin should revisit periodically.
 *
 * Implementation:
 *   1. previewBurn() — pure read; returns the scaledCost given a baseCost
 *      and the current burn-sink balance. Used by the preview UI.
 *   2. executeBurn() — atomic. Reduces character.attributes.frequency.level
 *      by N, transfers N KRMA from the character wallet → BURN_SINK wallet
 *      via the ledger. The BURN_SINK wallet is frozen by genesis seed, so
 *      KRMA there is functionally removed from circulation.
 *
 * Note on baseCost source: today, the GM (or player, in the live UX flow)
 * supplies the baseCost. A future enhancement routes the request through
 * Kai for AI-priced judgment — the dispatcher event 'burn.requested' is
 * scaffolded but not wired by default.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/errors';
import { canEditCharacter, isAdminRole } from '@/lib/permissions';
import { executeTransaction } from './krma/ledger';
import { getWalletByCharacter, getSystemWallet } from './krma/wallet';
import { SYSTEM_WALLETS } from '@/types/krma';
import type { GrowthCharacter } from '@/types/growth';

/**
 * Calibration constant for the burn cost multiplier. Higher value → slower
 * growth. With BURN_SCALE_CONSTANT = 50,000:
 *   - 0 KRMA ever burned     → multiplier 1.0×
 *   - 10,000 burned          → multiplier 1.2×
 *   - 50,000 burned          → multiplier 2.0×
 *   - 100,000 burned         → multiplier 3.0×
 *
 * Tune this once we have real beta-period burn flux data.
 */
const BURN_SCALE_CONSTANT = 50_000;

export const burnPreviewSchema = z.object({
  characterId: z.string().min(1),
  baseCost: z.number().int().positive().max(1_000_000),
  outcomeDescription: z.string().min(1).max(500),
});

export const burnExecuteSchema = z.object({
  characterId: z.string().min(1),
  baseCost: z.number().int().positive().max(1_000_000),
  outcomeDescription: z.string().min(1).max(500),
  /** Optional override of the scaled cost. Defaults to recomputing fresh. */
  confirmedCost: z.number().int().positive().optional(),
});

export interface BurnPreview {
  baseCost: number;
  burnSinkBalance: string;
  multiplier: number;
  scaledCost: number;
  maxFrequencyBefore: number;
  maxFrequencyAfter: number;
  /** True if scaledCost > the character's current max Frequency. */
  insufficientFrequency: boolean;
}

/**
 * Compute the multiplier from the burn-sink balance. Linear growth.
 */
export function burnMultiplier(burnSinkBalance: bigint): number {
  const bal = Number(burnSinkBalance);
  return 1 + (bal / BURN_SCALE_CONSTANT);
}

/**
 * Preview the burn — returns the scaled cost without writing anything.
 */
export async function previewBurn(
  userId: string,
  userRole: string,
  input: z.infer<typeof burnPreviewSchema>,
): Promise<BurnPreview> {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Cannot burn this character\'s Frequency');
  }
  const charData = JSON.parse(character.data) as GrowthCharacter;
  const maxFrequencyBefore = charData.attributes?.frequency?.level ?? 0;

  const burnSinkWallet = await getSystemWallet('BURN', SYSTEM_WALLETS.BURN_SINK);
  const multiplier = burnMultiplier(burnSinkWallet.balance);
  const scaledCost = Math.max(1, Math.round(input.baseCost * multiplier));
  const maxFrequencyAfter = maxFrequencyBefore - scaledCost;
  return {
    baseCost: input.baseCost,
    burnSinkBalance: burnSinkWallet.balance.toString(),
    multiplier,
    scaledCost,
    maxFrequencyBefore,
    maxFrequencyAfter,
    insufficientFrequency: maxFrequencyAfter < 0,
  };
}

/**
 * Execute the burn — atomic ledger + character.data update.
 */
export async function executeBurn(
  userId: string,
  userRole: string,
  input: z.infer<typeof burnExecuteSchema>,
) {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Cannot burn this character\'s Frequency');
  }
  // Only the player or GM can confirm a burn. Admin override allowed.
  const isOwner = character.userId === userId;
  const isGM = character.campaign?.gmUserId === userId;
  if (!isOwner && !isGM && !isAdminRole(userRole)) {
    throw new ForbiddenError('Only the player or GM can confirm a burn');
  }

  const charData = JSON.parse(character.data) as GrowthCharacter;
  const maxFrequencyBefore = charData.attributes?.frequency?.level ?? 0;

  // Recompute the scaled cost fresh — never trust a client-supplied
  // confirmedCost without verification. (We accept it as a hint but use
  // the recomputed value.)
  const burnSinkWallet = await getSystemWallet('BURN', SYSTEM_WALLETS.BURN_SINK);
  const multiplier = burnMultiplier(burnSinkWallet.balance);
  const scaledCost = Math.max(1, Math.round(input.baseCost * multiplier));
  if (input.confirmedCost !== undefined && input.confirmedCost !== scaledCost) {
    throw new ValidationError(
      `Cost has shifted since preview (preview=${input.confirmedCost}, now=${scaledCost}). Refresh and re-confirm.`,
    );
  }
  if (scaledCost > maxFrequencyBefore) {
    throw new ValidationError(
      `Burn requires ${scaledCost} max Frequency but character has only ${maxFrequencyBefore}.`,
    );
  }

  const characterWallet = await getWalletByCharacter(input.characterId).catch(() => null);

  // Reduce max Frequency. Clamp current to new max if needed.
  const next = JSON.parse(JSON.stringify(charData)) as GrowthCharacter;
  next.attributes = next.attributes ?? ({} as GrowthCharacter['attributes']);
  next.attributes.frequency = next.attributes.frequency ?? { level: 0, current: 0 };
  next.attributes.frequency.level = maxFrequencyBefore - scaledCost;
  if ((next.attributes.frequency.current ?? 0) > next.attributes.frequency.level) {
    next.attributes.frequency.current = next.attributes.frequency.level;
  }

  // Transfer from the character wallet → BURN_SINK. If the character has
  // no wallet yet (no crystallization done), the Frequency reduction is
  // still recorded but no ledger transaction fires — the burn is purely
  // mechanical at that point. Once crystallization happens, future burns
  // hit the ledger normally.
  let transactionId: string | null = null;
  if (characterWallet && characterWallet.balance >= BigInt(scaledCost)) {
    const tx = await executeTransaction({
      fromWalletId: characterWallet.id,
      toWalletId: burnSinkWallet.id,
      amount: BigInt(scaledCost),
      state: 'BURN',
      reason: 'CHARACTER_ADJUST',
      description: `Burn: ${input.outcomeDescription}`,
      metadata: {
        baseCost: input.baseCost,
        multiplier,
        scaledCost,
        outcomeDescription: input.outcomeDescription,
        maxFrequencyBefore,
        maxFrequencyAfter: next.attributes.frequency.level,
      },
      campaignId: character.campaignId,
      actorId: userId,
      actorType: isGM ? 'GM' : 'USER',
      // Idempotency: per-character, per-cost, per-description. Two truly
      // independent burns of the same description need slightly different
      // text to not collide — accept that for now.
      idempotencyKey: `burn::${input.characterId}::${scaledCost}::${input.outcomeDescription}`,
    });
    transactionId = tx.id;
  }

  await prisma.character.update({
    where: { id: input.characterId },
    data: { data: JSON.stringify(next) },
  });

  return {
    scaledCost,
    multiplier,
    transactionId,
    maxFrequencyBefore,
    maxFrequencyAfter: next.attributes.frequency.level,
  };
}
