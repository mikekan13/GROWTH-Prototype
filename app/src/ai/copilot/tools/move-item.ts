/**
 * move_item — put a thing in a room or inside a container (Mike 2026-10-16:
 * "the canvas can be imagined as a top down view… some items can contain
 * other items. Like boxes and bookshelves and basically anything").
 * General tool (genesis WORLD passes, GM asks at the table, play).
 */
import { z } from 'zod';
import { placeItem } from '@/services/placement';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  item: z.string().min(1).max(200).describe('The thing: its local name (exact) or id.'),
  into: z.string().min(1).max(200).describe('Where it goes: a room (Location name/id) or a container item (name/id) — a bookcase, a drawer, a box, a bag.'),
  why: z.string().max(200).optional().describe('One line, for the log ("the kitchen things go in the kitchen").'),
});

export const moveItemTool: JewlTool = {
  name: 'move_item',
  description:
    'Put a thing in a room or inside a container. The world is a top-down map: every object sits somewhere — a room ' +
    '(a child Location of the home) or inside another object (a bookcase holds books, a drawer holds junk, a bag holds ' +
    'what she carries out). One place at a time; moving replaces the old place. A thing cannot contain itself.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const r = await placeItem(ctx.campaignId, { item: p.item, into: p.into });
    return {
      output: { ok: true, itemId: r.itemId, name: r.name, into: r.into.name, path: r.path.join(' › ') },
      affected: { items: [{ id: r.itemId }] },
    };
  },
};

registerJewlTool(moveItemTool);
