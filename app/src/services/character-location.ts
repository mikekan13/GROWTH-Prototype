/**
 * Character Location service — moves a character between Locations by
 * replacing their `located_at` EntityRelationship edges in a single
 * transaction.
 *
 * Used by:
 *  - JEWL's `move_character_to_location` tool — JEWL infers movement from
 *    narration ("they walk to the throne room") and snaps the canvas state.
 *  - Future drag-to-location canvas gestures will share this service.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';

export const moveCharacterToLocationSchema = z.object({
  characterId: z.string().min(1),
  /** Target location id. Pass `null` to remove all `located_at` edges
   *  (character becomes unanchored / off-canvas). */
  locationId: z.string().min(1).nullable(),
  note: z.string().max(500).optional(),
});

export interface MoveCharacterResult {
  characterId: string;
  fromLocationIds: string[];
  toLocationId: string | null;
}

export async function moveCharacterToLocation(
  actorUserId: string,
  actorRole: string,
  input: z.infer<typeof moveCharacterToLocationSchema>,
): Promise<MoveCharacterResult> {
  const character = await prisma.character.findUnique({
    where: { id: input.characterId },
    include: { campaign: { select: { gmUserId: true, id: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(actorUserId, actorRole, character)) {
    throw new ForbiddenError('Only the GM (or admin) can move a character');
  }

  if (input.locationId) {
    const target = await prisma.location.findUnique({
      where: { id: input.locationId },
      select: { id: true, campaignId: true },
    });
    if (!target) throw new NotFoundError('Target location not found');
    if (target.campaignId !== character.campaignId) {
      throw new ValidationError('Cannot move character to a location in a different campaign');
    }
  }

  return await prisma.$transaction(async tx => {
    const existing = await tx.entityRelationship.findMany({
      where: { sourceId: input.characterId, relationshipType: 'located_at' },
      select: { id: true, targetId: true },
    });
    const fromLocationIds = existing.map(e => e.targetId);

    if (existing.length > 0) {
      await tx.entityRelationship.deleteMany({
        where: { id: { in: existing.map(e => e.id) } },
      });
    }

    if (input.locationId) {
      await tx.entityRelationship.create({
        data: {
          campaignId: character.campaignId,
          sourceId: input.characterId,
          sourceType: 'CHARACTER',
          targetId: input.locationId,
          targetType: 'LOCATION',
          relationshipType: 'located_at',
          strength: 5,
        },
      });
    }

    return {
      characterId: input.characterId,
      fromLocationIds,
      toLocationId: input.locationId,
    };
  });
}
