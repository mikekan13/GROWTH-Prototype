/**
 * move_character_to_location — relocate a character via the `located_at`
 * relationship edge. Single transaction: delete old located_at edges,
 * create a new one to the target. Pass `locationId: null` to unanchor.
 *
 * JEWL calls this when narration implies movement ("they head to the
 * throne room", "Tara takes the river path") — the canvas folder system
 * auto-nests on the new edge.
 */

import 'server-only';
import {
  moveCharacterToLocation,
  moveCharacterToLocationSchema,
} from '@/services/character-location';
import { prisma } from '@/lib/db';
import { registerJewlTool } from './registry';
import { resolveLocationRef } from './create-location';
import type { JewlTool, JewlToolHandlerResult } from './types';

export const moveCharacterTool: JewlTool = {
  name: 'move_character_to_location',
  description:
    'Move a character to a Location (or unanchor with locationId=null). ' +
    'Replaces any existing located_at edge in one transaction. Use when ' +
    'narration implies movement, scene-cuts, or arrivals/departures. The ' +
    'canvas auto-nests the character inside the new location.',
  inputSchema: moveCharacterToLocationSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = moveCharacterToLocationSchema.parse(input);
    // A character by NAME is a character: exact name (case-insensitive) or id, within this campaign.
    const key = parsed.characterId.trim().toLowerCase();
    const chars = await prisma.character.findMany({ where: { campaignId: ctx.campaignId }, select: { id: true, name: true } });
    const who = chars.find(c => c.id === parsed.characterId) ?? chars.find(c => c.name.trim().toLowerCase() === key);
    if (!who) return { output: { ok: false, reason: `No character "${parsed.characterId}" in this campaign (name or id).` } };
    parsed.characterId = who.id;
    // A place by NAME is a place (2026-11-01: "Hotel Parking Lot" was refused as "Target location not found").
    if (parsed.locationId) {
      const ref = await resolveLocationRef(ctx.campaignId, parsed.locationId);
      if (!ref) return { output: { ok: false, reason: `No Location "${parsed.locationId}" in this campaign (name or id).` } };
      parsed.locationId = ref.id;
    }
    // A narrated arrival lands the token inside the drawn room on every canvas (2026-10-27).
    const result = await moveCharacterToLocation(ctx.actorId, ctx.actorRole, { snapCanvas: true, ...parsed });
    return {
      output: {
        characterId: result.characterId,
        fromLocationIds: result.fromLocationIds,
        toLocationId: result.toLocationId,
      },
      affected: {
        characters: [
          {
            id: result.characterId,
            // No character data change — relationship-only mutation.
            changes: [
              result.toLocationId
                ? `moved to ${result.toLocationId}`
                : 'unanchored from location',
            ],
          },
        ],
        locations: [
          ...(result.fromLocationIds.map(id => ({ id }))),
          ...(result.toLocationId ? [{ id: result.toLocationId }] : []),
        ],
      },
    };
  },
};

registerJewlTool(moveCharacterTool);
