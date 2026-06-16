/**
 * apply_condition — toggle one of the nine canon conditions on a character.
 *
 * Conditions are the 1:1 partners of attributes (weak↔Clout, deathsDoor↔
 * Frequency, etc.). They are normally set automatically when an attribute
 * hits zero, but the GM (or JEWL) can apply / clear them directly via this
 * tool for narrative effect ("they're shaken, mark Confused").
 */

import 'server-only';
import {
  setCharacterCondition,
  setCharacterConditionSchema,
  CONDITION_NAMES,
} from '@/services/character-attribute';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

export const applyConditionTool: JewlTool = {
  name: 'apply_condition',
  description:
    'Toggle one of the nine GRO.WTH conditions on a character. Conditions are ' +
    'normally set automatically when an attribute hits zero — use this tool only ' +
    'when the GM (or narration) explicitly applies/clears a condition directly. ' +
    "Setting `active=false` clears the condition. Note: 'deathsDoor' usually " +
    "fires automatically when Frequency = 0; only set it manually when the GM " +
    "specifically calls for it.",
  inputSchema: setCharacterConditionSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = setCharacterConditionSchema.parse(input);
    const result = await setCharacterCondition(ctx.actorId, ctx.actorRole, parsed);
    return {
      output: {
        characterId: result.characterId,
        condition: parsed.condition,
        active: parsed.active,
        changes: result.changes,
      },
      affected: {
        characters: [
          { id: result.characterId, data: result.characterData, changes: result.changes },
        ],
      },
    };
  },
};

export const CONDITIONS = CONDITION_NAMES;

registerJewlTool(applyConditionTool);
