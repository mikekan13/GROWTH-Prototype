/**
 * advance_clock — time passes, and the world LIVES it (Michael 2026-10-31:
 * "time jumps require simulation for all characters"; "much of the simulation
 * will be done when time moves like this").
 *
 * Under an hour: a pause in the scene — the clock moves, nothing more. An hour
 * or longer: a STRETCH — the clock walks the span and every crystallized
 * character does what is due in each window (its routines in their usual
 * hour, the intentions whose time has come, one account of its day toward
 * its goals, sleep at night). Trailblazers' stated intentions for the span
 * and the Watcher's overrides come in as `directives`. The output carries
 * what each being did and what the world refused (a move to a place not on
 * the map) — JEWL reads that to see what the world still lacks.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { advanceClock, advanceClockSchema, ensureDefaultTimescale } from '@/services/time';
import { localUnitsToCycles, type CalendarSpec } from '@/types/time';
import { liveStretch, STRETCH_MIN_SECONDS } from '@/services/stretch-live';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const directiveSchema = z.object({
  character: z.string().min(1).max(120).describe('The character, by name or id.'),
  authority: z.enum(['player', 'gm']).describe("'player' = the Trailblazer's own stated intention for the span (the character pursues it; the world adjudicates). 'gm' = the Watcher's override: it HAPPENS as written, no roll."),
  text: z.string().min(3).max(600).describe('First person for a player ("I spend the days at the shelter"); plain statement for a gm override ("Kristopher does not come by on the second day").'),
});

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
  narration: z
    .string()
    .max(800)
    .optional()
    .describe("What the Watcher said of the span, as said ('Two days pass. The next session opens on a Tuesday evening.'). Reaches every being once, at the start of the stretch."),
  directives: z
    .array(directiveSchema)
    .max(24)
    .optional()
    .describe("What Trailblazers say their characters do over the span, and the Watcher's overrides for specific characters. Gather these from the table BEFORE calling for a span of an hour or more; omit when nobody said anything."),
});

export const advanceClockTool: JewlTool = {
  name: 'advance_clock',
  description:
    'Time passes. Under an hour: the clock moves (a pause in the scene). An hour or more: the world LIVES it — ' +
    'every crystallized character runs its routines in their usual hour, acts on the intentions whose time has come, ' +
    'gives an account of each day toward its goals, sleeps at night; what one does reaches the others. Pass what the ' +
    'Watcher said of the span as `narration`, and Trailblazer intentions / Watcher overrides as `directives`. ' +
    'Returns what each being did day by day and what the world refused (places not on the map) — read it and report ' +
    'it to the Watcher. Do NOT call this for in-round combat actions unless the GM explicitly advances rounds. Call it ' +
    'ONCE per span; never split a span into pieces.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);
    const ts = (await ensureDefaultTimescale(ctx.campaignId)) as { unitsPerMetaCycle: number; calendar: CalendarSpec | null };
    const seconds = secondsOf(parsed.amount, parsed.unit, ts);
    if (seconds < STRETCH_MIN_SECONDS) {
      const result = await advanceClock(ctx.campaignId, ctx.actorId, ctx.actorRole, advanceClockSchema.parse({ amount: parsed.amount, unit: parsed.unit, note: parsed.note }));
      return {
        output: {
          lived: false,
          currentCycle: result.currentCycle,
          deltaCycles: result.deltaCycles,
          localDate: result.localDate.formatted,
          unit: parsed.unit,
          amount: parsed.amount,
        },
      };
    }
    const username = (await prisma.user.findUnique({ where: { id: ctx.actorId }, select: { username: true } }).catch(() => null))?.username ?? 'JEWL';
    const report = await liveStretch(ctx.campaignId, { userId: ctx.actorId, username, role: ctx.actorRole }, {
      seconds,
      narration: parsed.narration ?? parsed.note,
      source: 'jewl',
      directives: parsed.directives?.map((d) => ({ character: d.character, authority: d.authority, text: d.text })),
    });
    return {
      output: {
        lived: true,
        span: report.span,
        localDate: report.localDate,
        grain: report.grain,
        windows: report.windows,
        beings: report.lived.map((l) => ({
          name: l.name,
          status: l.status,
          ...(l.detail ? { detail: l.detail } : {}),
          days: l.days.map((d) => ({
            day: d.dayIndex + 1,
            acts: d.acts,
            said: d.said,
            ...(d.account ? { account: d.account } : {}),
            ...(d.outcome ? { outcome: d.outcome } : {}),
            intentionsDone: d.intentionsDone,
            routinesDone: d.routinesDone,
            ...(d.held?.length ? { held: d.held } : {}),
            ...(d.refused.length ? { refused: d.refused } : {}),
            ...(d.dreamed ? { slept: true } : {}),
          })),
        })),
        worldLacks: report.refused,
      },
      affected: { characters: report.lived.filter((l) => l.status === 'ok').map((l) => ({ id: l.characterId, changes: [`lived ${report.span}`] })) },
    };
  },
};

function secondsOf(amount: number, unit: z.infer<typeof inputSchema>['unit'], ts: { unitsPerMetaCycle: number; calendar: CalendarSpec | null }): number {
  const cycles = unit === 'cycle' ? amount : localUnitsToCycles(amount, unit, ts);
  const perHour = localUnitsToCycles(1, 'hour', ts);
  return perHour > 0 ? (cycles / perHour) * 3600 : 0;
}

registerJewlTool(advanceClockTool);
