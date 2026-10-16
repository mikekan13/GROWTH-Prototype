/**
 * stock_goods — place many ordinary things in ONE call (Mike 2026-10-16:
 * "simulation level extensive"). Genesis WORLD stage.
 */
import { stockGoods, stockGoodsSchema } from '@/services/life-goods';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

export const stockGoodsTool: JewlTool = {
  name: 'stock_goods',
  description:
    'Genesis WORLD stage. Stock a room, a wardrobe, a pantry, a drawer in ONE call: up to 120 ordinary things, each a real ' +
    'item she owns, placed in a room or INSIDE ANY OTHER THING — everything is a container (the sink holds a dish, the ' +
    'fridge the eggs, the junk drawer the batteries, a coat pocket a receipt); holders named in the same call are placed ' +
    'first. The canvas shows only what is at the top of a room; what is inside folds into its holder. Everyday goods ' +
    'with no mechanics are floor tier (0 KV) and need no Forge draft; anything with abilities or real value goes through ' +
    'grant_possession / the Forge. Garments: ONE item per piece — nothing comes in pairs (two socks = two goods). ' +
    'Consumables carry qty. Real pounds. Be exhaustive and specific to HER: what a real person in her life, means and ' +
    'season actually has, down to the half-used spices and the rubber bands.',
  inputSchema: stockGoodsSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await stockGoods(ctx.campaignId, { id: ctx.actorId, role: ctx.actorRole }, input);
    return { output: { ok: r.failed.length === 0, ...r }, affected: { characters: [{ id: stockGoodsSchema.parse(input).characterId, changes: ['possessions'] }] } };
  },
};

registerJewlTool(stockGoodsTool);
