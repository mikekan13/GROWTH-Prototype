/**
 * set_attribute_current — set an attribute pool to an absolute value
 * (heal, drain, set). Clamped to [0, max]. This is NOT the damage path
 * (apply_attribute_damage handles overflow rules); use this for direct
 * adjustments: rest restores, narrative healing, GM corrections.
 */

import 'server-only';
import {
  setAttributeCurrent,
  setAttributeCurrentSchema,
} from '@/services/character-attribute';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

export const setAttributeCurrentTool: JewlTool = {
  name: 'set_attribute_current',
  description:
    "Set a character's attribute pool to an absolute value (heal, drain, or " +
    "set directly). Clamps to [0, max]. Use for: narrative healing, scene " +
    "transitions that restore stats, GM corrections. For typed combat damage " +
    "with overflow rules use apply_attribute_damage instead.",
  inputSchema: setAttributeCurrentSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = setAttributeCurrentSchema.parse(input);
    const result = await setAttributeCurrent(ctx.actorId, ctx.actorRole, parsed);
    return {
      output: {
        characterId: result.characterId,
        attribute: parsed.attribute,
        newCurrent: parsed.current,
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

registerJewlTool(setAttributeCurrentTool);
