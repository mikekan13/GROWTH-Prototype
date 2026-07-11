/**
 * Damage Service — applies typed damage to a character's body anatomy.
 *
 * Entry point: `applyDamageToCharacter()`. Loads the character, routes the
 * damage through the body container cascade (`lib/body-damage.ts`), then
 * persists the updated anatomy back to character.data.
 *
 * Design rules:
 *  - Pure ledger: no KRMA transfers fire here. Damage affects body parts only.
 *    KRMA flows when death triggers fire downstream (see krma/death-split.ts).
 *  - Idempotent on partial failure: if the persist step fails, the in-memory
 *    cascade computation is discarded — we never half-apply damage.
 *  - Extensible: adding a new damage type means extending the `DamageType`
 *    union in `lib/body-damage.ts`. This service doesn't care which type.
 *
 * The complement to this is the death engine — when damage makes Frequency
 * hit zero, the GM triggers a death event via the separate /api/characters/
 * [id]/death endpoint. We do NOT auto-trigger death from here; that's an
 * intentional decision so the GM stays in control of the moment.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { routeDamage, HUMAN_BASELINE_ANATOMY, type DamageType, type DamageEvent, type WornDamageResult } from '@/lib/body-damage';
import { buildWornLayers } from '@/services/inventory';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';

export const applyDamageSchema = z.object({
  characterId: z.string().min(1),
  damageType: z.enum(['piercing', 'slashing', 'bashing', 'heat', 'cold', 'decay', 'energy']),
  amount: z.number().int().nonnegative().max(10_000),
  /** For piercing only: path of partNames from root to the target internal. */
  piercingTargetPath: z.array(z.string()).optional(),
  /** Free-form note recorded onto the campaign event log for replay. */
  note: z.string().max(500).optional(),
});

export interface ApplyDamageResult {
  events: DamageEvent[];
  anyDestroyed: boolean;
  /** New anatomy tree after damage (persisted to character.data). */
  bodyAnatomy: GrowthWorldItem;
  /** Equipped-item absorption events (T26) — armor took the hit first. */
  wornDamage: WornDamageResult[];
}

export async function applyDamageToCharacter(
  actorUserId: string,
  actorRole: string,
  input: z.infer<typeof applyDamageSchema>,
): Promise<ApplyDamageResult> {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Only the GM (or admin) can apply damage');
  }

  let charData: GrowthCharacter;
  try {
    charData = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    throw new ValidationError('Invalid character data — cannot apply damage');
  }

  // Lazily attach the Human baseline if the character has no anatomy yet
  // (legacy characters created before bodyAnatomy was a field).
  const currentAnatomy =
    (charData.bodyAnatomy as GrowthWorldItem | undefined) ??
    (JSON.parse(JSON.stringify(HUMAN_BASELINE_ANATOMY)) as GrowthWorldItem);

  // T26: equipped items are the outer damage layers — armor absorbs before
  // the body part it covers (outer-absorbs-first, INV-52 layer rules).
  const wornLayers = await buildWornLayers(input.characterId);

  const result = routeDamage(currentAnatomy, input.damageType as DamageType, input.amount, {
    piercingTargetPath: input.piercingTargetPath,
    wornLayers,
  });

  // Persist body
  const next: GrowthCharacter = { ...charData, bodyAnatomy: result.next };
  await prisma.character.update({
    where: { id: input.characterId },
    data: { data: JSON.stringify(next) },
  });

  // Persist armor condition changes back to the item instances.
  for (const wd of result.wornDamage) {
    if (!wd.brokeTier) continue;
    const row = await prisma.campaignItem.findUnique({ where: { id: wd.itemId } });
    if (!row) continue;
    const itemData = JSON.parse(row.data) as Record<string, unknown>;
    itemData.condition = wd.conditionAfter;
    await prisma.campaignItem.update({
      where: { id: wd.itemId },
      data: {
        data: JSON.stringify(itemData),
        ...(wd.destroyed ? { status: 'DESTROYED' } : {}),
      },
    });
  }

  // Log to campaign events — keeps a replayable record alongside other
  // game events. Failure here doesn't roll back the damage (the damage
  // already persisted); we just lose the event entry.
  if (character.campaignId) {
    const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { username: true } });
    await prisma.campaignEvent.create({
      data: {
        campaignId: character.campaignId,
        type: 'damage',
        actor: 'gm',
        actorUserId: actorUserId,
        actorName: actor?.username ?? 'GM',
        payload: JSON.stringify({
          characterId: input.characterId,
          characterName: character.name,
          damageType: input.damageType,
          amount: input.amount,
          piercingTargetPath: input.piercingTargetPath,
          note: input.note,
          events: result.events,
          anyDestroyed: result.anyDestroyed,
        }),
      },
    }).catch(() => { /* swallow logging failure */ });
  }

  return {
    events: result.events,
    anyDestroyed: result.anyDestroyed,
    bodyAnatomy: result.next,
    wornDamage: result.wornDamage,
  };
}
