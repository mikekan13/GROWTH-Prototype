/**
 * apply_attribute_damage — JEWL's first registered tool.
 *
 * Wraps `services/character-attribute.applyAttributeDamage` so JEWL can
 * call it via Anthropic tool-use. This is the Affinity Cycle path:
 * damage reduces an attribute pool (Frequency / Focus / etc.).
 *
 * Body-composition damage (anatomy parts) is a separate tool to come.
 */

import 'server-only';
import { z } from 'zod';
import {
  applyAttributeDamage,
  applyAttributeDamageSchema,
  ATTRIBUTE_NAMES,
} from '@/services/character-attribute';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  characterId: z.string().min(1).describe('The character receiving damage.'),
  amount: z.number().int().min(1).describe('Damage amount in points.'),
  targetAttribute: z
    .enum(ATTRIBUTE_NAMES)
    .describe(
      'Which attribute pool the damage routes to (Affinity Cycle). ' +
        'Natural targets: piercing→clout, slashing→celerity, heat→constitution, ' +
        'decay→focus, cold→willpower, bashing→wisdom, energy→wit. Flow prices as focus. ' +
        'Frequency is off-ring (20× multiplier already priced in weapon authoring).',
    ),
  damageType: z
    .enum(['piercing', 'slashing', 'bashing', 'heat', 'cold', 'decay', 'energy'])
    .optional()
    .describe('Damage type label for the log; does not change resolution math.'),
  note: z
    .string()
    .max(500)
    .optional()
    .describe('Narrative note appended to the campaign event log.'),
});

export const applyAttributeDamageTool: JewlTool = {
  name: 'apply_attribute_damage',
  description:
    'Reduce a character\'s attribute pool by an amount (Affinity Cycle path). ' +
    'Use when the GM (or the narrative) calls for a character to take typed damage ' +
    'that targets one of the nine attributes. Overflow to Frequency happens automatically ' +
    'when a non-Frequency attribute would go below zero.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = applyAttributeDamageSchema.parse(input);
    const result = await applyAttributeDamage(ctx.actorId, ctx.actorRole, parsed);
    return {
      output: {
        characterId: result.characterId,
        changes: result.changes,
        frequencyDepleted: result.frequencyDepleted,
      },
      affected: {
        characters: [
          {
            id: result.characterId,
            data: result.characterData,
            changes: result.changes,
          },
        ],
      },
    };
  },
};

registerJewlTool(applyAttributeDamageTool);
