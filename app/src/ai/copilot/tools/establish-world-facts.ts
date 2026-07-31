/**
 * establish_world_facts — JEWL writes the mechanical play-substrate.
 *
 * WorldFacts are what the persona-harness adjudicator resolves entity
 * intents against — a room isn't "ready to play in" until the facts play
 * will touch are on the ledger (the seeded apartment shipped with 21).
 * Append-and-supersede semantics via the world-ledger service: an
 * existing live fact on the same subjectKey is superseded, never
 * duplicated. GM/ADMIN gated.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';
import { establishFact, currentFacts, supersede } from '@/daya/world-ledger';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  facts: z
    .array(
      z.object({
        subjectKey: z.string().min(1).max(200).describe(
          'Dotted convention: room.object[.subobject], e.g. "apartment.desk.laptop" — stable keys, not prose.',
        ),
        fact: z.string().min(1).max(1000).describe(
          'The truth of this subject as play will encounter it — concrete, present-tense.',
        ),
      }),
    )
    .min(1)
    .max(100),
  cycle: z.number().int().min(0).optional().describe(
    'Narrative cycle to stamp. Omit to use the campaign ledger\'s current (latest) cycle.',
  ),
});

export const establishWorldFactsTool: JewlTool = {
  name: 'establish_world_facts',
  description:
    'Write world facts to the campaign ledger — the substrate the persona-harness ' +
    'adjudicator resolves actions against. A built environment is not ready to ' +
    'play until the facts play will touch exist (surfaces, objects, states, ' +
    'sounds, what is where). Same-subjectKey facts supersede, never duplicate. ' +
    'Batch a whole room per call.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: { ok: false, reason: 'Not authorized to establish world facts.' } };
    }

    const parsed = inputSchema.parse(input);

    let cycle = parsed.cycle;
    if (cycle == null) {
      const latest = await prisma.worldFact.aggregate({
        where: { campaignId: ctx.campaignId },
        _max: { establishedAtCycle: true },
      });
      cycle = latest._max.establishedAtCycle ?? 0;
    }

    let established = 0;
    let superseded = 0;
    for (const item of parsed.facts) {
      const live = await currentFacts(ctx.campaignId, item.subjectKey);
      if (live.length > 0) {
        await supersede(live[0].id, { fact: item.fact, cycle });
        superseded += 1;
      } else {
        await establishFact(ctx.campaignId, item.subjectKey, item.fact, cycle);
        established += 1;
      }
    }

    return {
      output: { ok: true, established, superseded, cycle, total: parsed.facts.length },
    };
  },
};

registerJewlTool(establishWorldFactsTool);
