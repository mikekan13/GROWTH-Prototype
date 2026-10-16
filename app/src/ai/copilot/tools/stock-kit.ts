/**
 * stock_kit — give a HOLDER its quantum contents (Mike 2026-10-16): a KV
 * budget + one-line truth of what is ordinarily in it (the fridge, the
 * pantry, the junk drawer), drawn down into real items when observed in
 * play (draw_from_kit). Genesis WORLD stage.
 */
import { z } from 'zod';
import { stockKit, stockKitSchema } from '@/services/kits';
import { resolvePlace } from '@/services/placement';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = stockKitSchema.extend({
  holder: z.string().min(1).max(200).describe('The holder: its local name ("The fridge", "the junk drawer") or campaign item id. Stock it first with stock_goods.'),
});

export const stockKitTool: JewlTool = {
  name: 'stock_kit',
  description:
    'Genesis WORLD stage. Give a HOLDER (fridge, pantry, junk drawer, medicine cabinet, toolbox…) its ordinary contents ' +
    'as a KIT: a KV budget (decimal — KV is the price) + ONE line of truth naming what is in it. The kit\'s KV is spent ' +
    'now, once; its contents become real items only when observed in play (draw_from_kit) and persist once seen. ' +
    'Crystallize what matters (worn, carried, used, storied, valuable) with stock_goods instead. Re-stocking keeps what ' +
    'was already drawn.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const place = await resolvePlace(ctx.campaignId, p.holder);
    if (!place || place.kind !== 'item') throw new Error(`No holder "${p.holder}" — a kit lives on a thing (stock it with stock_goods first), not on a room.`);
    const r = await stockKit(ctx.campaignId, place.id, { kvBudget: p.kvBudget, contents: p.contents });
    return { output: { ok: true, ...r } };
  },
};

registerJewlTool(stockKitTool);
