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
import { registerJewlTool } from './registry';
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
    const result = await moveCharacterToLocation(ctx.actorId, ctx.actorRole, parsed);
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
