/**
 * sketch_npc — SKETCH genesis from the table (Mike 2026-10-12, "Speed tiers").
 *
 * The Watcher says "give me a grumpy innkeeper" and JEWL calls this: a
 * voiceable NPC with a mechanically valid, wallet-priced sheet lands in the
 * background (~15–30 s) while play continues. Offered on the TABLE lane only
 * (runtime TABLE_ONLY_TOOLS — never in a work cycle). The wall applies as to
 * every tool: the Watcher's line was screened at dispatch, the seed text is
 * screened again in startSketch, and the model's answer by routedChatText.
 * Logic lives in services/sketch-genesis.ts.
 */
import 'server-only';
import { z } from 'zod';
import { startSketch } from '@/services/sketch-genesis';
import { clip } from '@/services/sketch-genesis-rules';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

export const sketchNpcInputSchema = z.object({
  seedText: z.string().min(1).describe('Who to sketch, in the Watcher\'s words plus anything the scene makes obvious (role, mood, a name if given).'),
});

export const sketchNpcTool: JewlTool = {
  name: 'sketch_npc',
  description:
    'Table only. The Watcher is improvising an NPC on the fly ("give me a grumpy innkeeper"). ' +
    'Sketch one in the background: name, persona, voice, a few memories and a mechanically valid sheet ' +
    'priced against the campaign wallet — no prods, no Forge review. Returns at once with the characterId; ' +
    'the card appears on the canvas in ~20 s. For main characters use full genesis instead.',
  inputSchema: sketchNpcInputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const { seedText } = sketchNpcInputSchema.parse(input);
    const started = await startSketch(ctx.campaignId, { id: ctx.actorId, role: ctx.actorRole }, { seedText });
    return {
      output: {
        ok: true,
        characterId: started.characterId,
        status: started.status,
        summary: `Sketching "${clip(seedText, 80)}" in the background — the card lands in about 20 seconds.`,
      },
    };
  },
};

registerJewlTool(sketchNpcTool);
