/**
 * advance_clock — JEWL's second registered tool.
 *
 * Wraps `services/time.advanceClock`. Lets JEWL push the campaign clock
 * forward when narration implies time has passed ("the party rests for the
 * night", "three days pass on the road"). Per [[time-system-design-2026-06-08]]
 * one of JEWL's core competencies is inferring time advancement from prose
 * and stamping it on the campaign timeline — this tool is that primitive.
 */

import 'server-only';
import { z } from 'zod';
import { advanceClock, advanceClockSchema } from '@/services/time';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  amount: z
    .number()
    .positive()
    .max(1_000_000)
    .describe('How much to advance — magnitude in the chosen unit.'),
  unit: z
    .enum(['cycle', 'year', 'month', 'day', 'hour', 'round'])
    .describe(
      "Time unit. 'cycle' = one meta cycle (universal scale). 'year/month/day/hour' = " +
        "local units in the campaign's default timescale. 'round' = a 6-second combat " +
        "round; use during active encounters. Choose the unit the narration implies " +
        "(don't translate manually — pass 'day' not 'hour' if the prose says days).",
    ),
  note: z
    .string()
    .max(500)
    .optional()
    .describe('Optional one-line summary of why time advanced — appears in the history log.'),
});

export const advanceClockTool: JewlTool = {
  name: 'advance_clock',
  description:
    'Advance the campaign clock by a chosen amount. Call when narration or GM intent ' +
    'implies time passing — rest, travel, downtime, ritual, scene transitions. ' +
    'Each call writes a history entry with the new local date. Do NOT call this for ' +
    'in-round combat actions unless the GM explicitly advances rounds.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = advanceClockSchema.parse(input);
    const result = await advanceClock(ctx.campaignId, ctx.actorId, ctx.actorRole, parsed);
    return {
      output: {
        currentCycle: result.currentCycle,
        deltaCycles: result.deltaCycles,
        localDate: result.localDate.formatted,
        unit: parsed.unit,
        amount: parsed.amount,
      },
    };
  },
};

registerJewlTool(advanceClockTool);
