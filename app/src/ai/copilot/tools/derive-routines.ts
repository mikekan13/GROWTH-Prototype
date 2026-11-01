/**
 * derive_routines — read a character's routines again from their own words and the world's facts (2026-11-01: JEWL wrote
 * the facts of Kristopher's days — the runs, Violet the customer by name, the cash to the till — and nothing re-read them;
 * the deriver only runs by itself for a being with no routines at all). The engine derives; JEWL asks for it.
 * [[ruling-ordinary-competence-routines-player-rolls-2026-10-30]]
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { deriveRoutines } from '@/services/routine-derive';
import { endsInWords } from '@/daya/routines';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  character: z.string().min(1).max(120).describe('The character, by name or id.'),
});

export const deriveRoutinesTool: JewlTool = {
  name: 'derive_routines',
  description:
    "Re-read a character's ROUTINES (what their hands do when a habit runs) from their own stated intentions, the things they hold and " +
    'the facts of the world. Call it after the facts of their days changed (a new workplace, a named customer, a new habit) — the ' +
    'engine derives; you do not write routines. Returns each routine with its triggers and ends in words.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const p = inputSchema.parse(input);
    const ref = p.character.trim();
    const people = await prisma.character.findMany({ where: { campaignId: ctx.campaignId }, select: { id: true, name: true } });
    const c = people.find((x) => x.id === ref) ?? people.find((x) => x.name.toLowerCase() === ref.toLowerCase()) ?? people.find((x) => x.name.toLowerCase().startsWith(ref.toLowerCase()));
    if (!c) return { output: { ok: false, reason: `no character "${p.character}" in this campaign` } };
    const drafts = await deriveRoutines(c.id);
    return {
      output: {
        ok: true,
        character: c.name,
        routines: drafts.map((d) => ({ name: d.name, cadence: d.cadence, triggers: d.triggers, ends: endsInWords(d.ends) })),
        note: drafts.length ? undefined : `${c.name} has no standing intentions (a cadence or a trigger) to read routines from — their routines come from their own words about their days.`,
      },
      affected: { characters: [{ id: c.id, changes: ['routines'] }] },
    };
  },
};

registerJewlTool(deriveRoutinesTool);
