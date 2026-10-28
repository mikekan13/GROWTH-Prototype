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
import { snapCharacterToLocation } from '@/services/canvas-placement';
import { placeBeingInRoom } from '@/services/spatial-world';
import { broadcastEvent } from '@/lib/campaign-stream';

export const moveCharacterToLocationSchema = z.object({
  characterId: z.string().min(1),
  /** Target location id. Pass `null` to remove all `located_at` edges
   *  (character becomes unanchored / off-canvas). */
  locationId: z.string().min(1).nullable(),
  note: z.string().max(500).optional(),
  /** Also place the character's TOKEN inside the target room on the map (its stand-spot by the way in), so a narrated move is visible (Mike 09-26; the map 2026-10-27). */
  snapCanvas: z.boolean().optional(),
  /** false = the caller broadcasts its own, richer event (a walk's `token_moved`). Default true. */
  broadcast: z.boolean().optional(),
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
  }).then(async (result) => {
    let placed = false;
    if (input.snapCanvas && input.locationId) {
      // A drawn room: the token lands at the room's stand-spot and every canvas moves it (token_moved).
      try { placed = await placeBeingInRoom(character.campaignId!, input.characterId, input.locationId, 'jewl'); } catch (err) { console.warn('[character-location] map placement failed', err); }
      if (!placed) {
        try { await snapCharacterToLocation(character.campaignId!, input.characterId, input.locationId); } catch (err) { console.warn('[character-location] canvas snap failed', err); }
      }
    }
    if (input.broadcast !== false && !placed) {
      try {
        broadcastEvent(character.campaignId!, {
          kind: 'map_changed',
          locationIds: [...result.fromLocationIds, ...(result.toLocationId ? [result.toLocationId] : [])],
          characterIds: [result.characterId],
        });
      } catch { /* canvases re-read on their own */ }
    }
    return result;
  });
}
