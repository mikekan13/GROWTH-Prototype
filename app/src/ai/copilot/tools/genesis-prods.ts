/**
 * Genesis prod tools (Mike 2026-10-12 — genesis is a dialogue,
 * [[ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12]]).
 *
 * end_prod_round is offered ONLY in a PRODDING work cycle (runtime
 * STAGE_ONLY_TOOLS + allowedTools). raise_prod is offered in EVERY genesis
 * work cycle (2026-10-12: a question is a prod at any stage; stageTools). record_delegated_choice is
 * offered in the build: when the GM said "you decide", JEWL writes back what
 * he chose. Logic lives in services/genesis-prods.ts.
 */
import 'server-only';
import {
  endProdRound,
  endProdRoundSchema,
  raiseProd,
  raiseProdSchema,
  recordDelegatedChoice,
  recordDelegatedChoiceSchema,
} from '@/services/genesis-prods';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

export const raiseProdTool: JewlTool = {
  name: 'raise_prod',
  description:
    'Any genesis stage. The ONLY way to ask the GM something — never write a question into a report or note. Ask ONE question about a creative/authorial gap in the seed ' +
    '(who, why, what happened, what it means) that is load-bearing for the mechanics or the first ' +
    'sessions. anchorQuote = the exact seed passage that raised it (≤300 chars); why = one line on ' +
    'what hinges on it; kind = CREATIVE, or MECHANICAL_CHECK when a mechanic hinges on a creative ' +
    'fact only the GM can settle. Never stats/KV/catalog questions; never propose an answer in the ' +
    'question. At most 5 per round, most load-bearing first. After Build the session waits on the GM and resumes by itself once he decides.',
  inputSchema: raiseProdSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const prod = await raiseProd(input, ctx.campaignId);
    return { output: { ok: true, prodId: prod.id, round: prod.round, order: prod.order } };
  },
};

export const endProdRoundTool: JewlTool = {
  name: 'end_prod_round',
  description:
    'Genesis prod stage only. Close this round of prods and wait for the GM. Call it with no new ' +
    'prods when nothing load-bearing is left to ask — the GM then presses Build. You cannot leave ' +
    'the prod stage yourself.',
  inputSchema: endProdRoundSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await endProdRound(input, ctx.campaignId);
    return { output: { ok: true, ...r, note: 'Waiting on the GM — answers, or Build.' } };
  },
};

export const recordDelegatedChoiceTool: JewlTool = {
  name: 'record_delegated_choice',
  description:
    'Genesis build: the GM delegated a prod to you ("you decide"). Record what you chose — one or ' +
    'two sentences — BEFORE anything you write relies on it. Never for a prod the GM left open.',
  inputSchema: recordDelegatedChoiceSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const prod = await recordDelegatedChoice(input, ctx.campaignId);
    return { output: { ok: true, prodId: prod.id, recorded: prod.jewlFill } };
  },
};

registerJewlTool(raiseProdTool);
registerJewlTool(endProdRoundTool);
registerJewlTool(recordDelegatedChoiceTool);
