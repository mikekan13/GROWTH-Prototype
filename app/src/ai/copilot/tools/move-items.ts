/**
 * move_items — a BATCH of placements in one call (the stopgap beside
 * organize_place; Mike 2026-10-16: never again a per-item tool loop for bulk
 * placement). Each move fails alone; with factPrefix the moved things'
 * placement facts are re-derived from the map.
 */
import { z } from 'zod';
import { moveItems } from '@/services/placement';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  moves: z.array(z.object({
    item: z.string().min(1).max(200).describe('The thing (exact local name or id).'),
    into: z.string().min(1).max(200).describe('A room (Location name/id) or a container item (name/id).'),
  })).min(1).max(200),
  factPrefix: z.string().max(120).optional().describe('This place\'s fact key prefix (e.g. "violet_apartment"); when given, each moved thing\'s placement fact is re-derived from the map.'),
});

export const moveItemsTool: JewlTool = {
  name: 'move_items',
  description:
    'Put MANY things in their rooms or containers in one call (containers before their contents). One move failing ' +
    'does not stop the rest. Pass factPrefix to keep the placement facts in step with the map. For a whole place at ' +
    'once — rooms, placements, descriptions, state — use organize_place instead.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const r = await moveItems(ctx.campaignId, p.moves, { factPrefix: p.factPrefix });
    return {
      output: { ok: r.results.every(x => x.ok), moved: r.moved, derivedKeys: r.derivedKeys, results: r.results.map(x => ({ ...x, path: x.path?.join(' › ') })) },
      affected: { items: [] },
    };
  },
};

registerJewlTool(moveItemsTool);
