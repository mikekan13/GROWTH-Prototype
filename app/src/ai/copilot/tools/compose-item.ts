/**
 * compose_item — tell an EXISTING thing what it is made of (Michael 2026-11-01, object permanence: "almost any item is
 * what I'm describing… Kristopher's prayer rope should be composed of what makes it. Eventually you get to the raw
 * materials"). Parts by kind and count; money parts carry their face. The player sees one short line; the parts are
 * there when needed.
 */
import { z } from 'zod';
import { setParts } from '@/services/parts';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const partSchema = z.object({
  name: z.string().min(1).max(80).describe('One kind of part, singular: "twenty-dollar bill", "arrow", "wool cord knotted 100 times", "blue plastic bead".'),
  count: z.number().int().min(1).max(10000),
  faceValue: z.number().min(0).optional().describe('MONEY ONLY: the face of ONE in `currency` (20 for a twenty).'),
  weightLbs: z.number().min(0).optional().describe('Pounds for ONE part.'),
  value: z.number().min(0).optional().describe('KV of ONE part (usually omit).'),
  bound: z.boolean().optional().describe('Made INTO the thing (braided, sewn) — off only by unmaking it. Default loose: a hand can take one out.'),
  primaryMaterial: z.string().max(60).optional().describe('Wool, Polymer, Paper, Steel…'),
  description: z.string().max(160).optional(),
});

const inputSchema = z.object({
  item: z.string().min(1).max(200).describe('The thing, by exact local name or id.'),
  parts: z.array(partSchema).min(1).max(24).describe('What it is MADE OF, by kind and count. Replaces any earlier parts.'),
  currency: z.string().max(12).optional().describe('Currency code for faceValue (default: the campaign\'s only active currency).'),
  because: z.string().max(200).optional().describe('One line for the object\'s ledger ("read from the Watcher\'s description").'),
});

export const composeItemTool: JewlTool = {
  name: 'compose_item',
  description:
    'Tell an existing thing what it is MADE OF (object permanence): parts by kind and count. Money is its bills with faceValue ' +
    '(two twenty-dollar bills and a five) — never a quantity or a prose state; a bundle of arrows is 20 arrow parts; a prayer rope is ' +
    'a knotted cord and its beads, `bound`. Only what the Watcher said. The player sees one short line; the parts are a hover away.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const r = await setParts(ctx.campaignId, p.item, p.parts, { currency: p.currency, because: p.because });
    return { output: { ok: true, item: r.name, id: r.id, madeOf: r.words }, affected: { items: [{ id: r.id }] } };
  },
};

registerJewlTool(composeItemTool);
