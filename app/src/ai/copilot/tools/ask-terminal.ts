/**
 * ask_terminal — JEWL as the front man for the audience with the gods
 * (MEMORY-DESIGN §2: "JEWL answers most of it himself; the Godheads sit
 * behind him"). Read-only. Answers come from the canon ledger and the
 * custodians' vines of THIS campaign only — the Watcher's wall — with a
 * citation on every sentence, or "The record holds nothing on that."
 */
import 'server-only';
import { z } from 'zod';
import { isWatcherOrAbove } from '@/lib/permissions';
import { askTerminal } from '@/services/terminal-recall';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const inputSchema = z.object({ question: z.string().min(1).max(2000) });

export const askTerminalTool: JewlTool = {
  name: 'ask_terminal',
  description:
    'Ask the Terminal — the infallible record of this campaign — a factual question ' +
    '("how did X die", "what did Y say to Z", "who touched goal G"). Returns the canon ' +
    'events and custodian readings that answer it, plus a phrased answer where EVERY ' +
    'sentence carries [c:ID] citations into the record; sentences without a citation are ' +
    'dropped. Scope is this campaign only. Watcher/ADMIN only. Read-only.',
  inputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) return { output: { revealed: false, reason: 'The Terminal answers the Watcher.' } };
    const { question } = inputSchema.parse(input);
    const a = await askTerminal(ctx.campaignId, { userId: ctx.actorId, role: ctx.actorRole }, question);
    return {
      output: {
        revealed: true,
        answer: a.answer,
        citations: a.citations,
        phrasedBy: a.phrasedBy,
        facts: a.facts.slice(0, 10).map(f => ({ id: f.id, cycle: f.cycle, kind: f.kind, narration: f.narration })),
        vines: a.vines,
        domains: a.domains,
      },
    };
  },
};

registerJewlTool(askTerminalTool);
