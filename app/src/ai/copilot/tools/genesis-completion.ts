/**
 * Genesis completion tools (Mike 2026-10-12) — the levers of the stages
 * after the sheet: AGE → POSSESSIONS → SEEDS → WORLD_FACTS → VINES.
 * Each is offered in its own stage's work cycle (work-cycle-text.ts
 * COMPLETION_STAGE_TOOLS). Logic lives in services/genesis-*.ts.
 *
 *   set_starting_age  — her years per root/branch sum to the brief's AGE;
 *                       stamps identity.age, birthCycle, fatedAge
 *   grant_possession  — catalog-first pull + narrative paint, three tiers
 *   seed_npc          — a named person → NPC seed shell (no model call)
 *   seed_location     — home/hometown → Location seed from the GM's messages
 *   author_vine_goal  — the GOAL third of her GRO.vines, authoredBy 'ai'
 */
import 'server-only';
import { setStartingAge, setStartingAgeSchema } from '@/services/genesis-age';
import { dropPossession, dropPossessionSchema, grantPossession, grantPossessionSchema } from '@/services/genesis-possessions';
import { seedLocation, seedLocationSchema, seedNpc, seedNpcSchema } from '@/services/genesis-seeds';
import { authorVineGoals, authorVineGoalSchema } from '@/services/genesis-vines';
import { establishCurrency, establishCurrencySchema, listCurrencies } from '@/services/currency';
import { grantCash, grantCashSchema, setIncome, setIncomeSchema } from '@/services/wealth';
import { lifeBudget } from '@/services/life-budget';
import { z } from 'zod';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

export const setStartingAgeTool: JewlTool = {
  name: 'set_starting_age',
  description:
    'Genesis AGE stage. Age is additive: her starting age = the sum of the years she spent in each root and branch ' +
    '(seeds add 0) and must equal the brief\'s AGE exactly. Give her years per block where the archetype\'s ' +
    'default does not fit her story (instance years — the archetype is untouched). Stamps her age, birthCycle and fatedAge.',
  inputSchema: setStartingAgeSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await setStartingAge(ctx.campaignId, input);
    const id = setStartingAgeSchema.parse(input).characterId;
    return { output: { ok: true, ...r }, affected: { characters: [{ id, changes: ['age'] }] } };
  },
};

export const grantPossessionTool: JewlTool = {
  name: 'grant_possession',
  description:
    'Genesis POSSESSIONS stage. Give her a thing her story grants: CATALOG FIRST — an existing campaign or stock ' +
    'item archetype by exact name (stock is pulled free), painted for her (localName + story). tier: equipped (worn ' +
    'on a body region of HER anatomy — slot), carried (on her), owned (the deed only — a house, a car, a box in ' +
    'storage; optionally where it is). Weight in real lbs. A thing no archetype fits → propose_forge_blueprint ' +
    'type "item" (agnostic archetype + her paint), then grant it after approval.',
  inputSchema: grantPossessionSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await grantPossession(ctx.campaignId, { id: ctx.actorId, role: ctx.actorRole }, input);
    return r.ok
      ? { output: r, affected: { items: [{ id: r.itemId }], characters: [{ id: grantPossessionSchema.parse(input).characterId, changes: ['possessions'] }] } }
      : { output: r };
  },
};

export const dropPossessionTool: JewlTool = {
  name: 'drop_possession',
  description:
    'Genesis WORLD stage. Take back a thing YOU granted her — granted twice, over budget, or cut by the GM. ' +
    'By her local name (exact) or the item id; it and its deed are removed. Only things she holds or owns.',
  inputSchema: dropPossessionSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await dropPossession(ctx.campaignId, { id: ctx.actorId, role: ctx.actorRole }, input);
    return r.ok
      ? { output: r, affected: { items: [{ id: r.itemId }], characters: [{ id: dropPossessionSchema.parse(input).characterId, changes: ['possessions'] }] } }
      : { output: r };
  },
};

export const seedNpcTool: JewlTool = {
  name: 'seed_npc',
  description:
    'Genesis SEEDS stage. Every person her backstory names becomes an NPC SEED — a shell for the Watcher: name, who ' +
    'they are to her, valence (-1..+1), what the story says of them, and the open thread between them. No sheet, no ' +
    'portrait, no invention. A thread the GM LEFT OPEN rides as openThreadProdId alone — never answer it.',
  inputSchema: seedNpcSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await seedNpc(ctx.campaignId, input);
    return { output: { ok: true, ...r }, affected: { characters: [{ id: r.npcId, changes: ['seeded'] }] } };
  },
};

export const seedLocationTool: JewlTool = {
  name: 'seed_location',
  description:
    'Genesis SEEDS stage. Her home / hometown / workplace becomes a Location seed (places are not forged — be as ' +
    'specific as the sources). Draw it from the GM WORLD MESSAGES and the backstory and cite the message ids you used. ' +
    'owned = she holds the deed (renting is not owning).',
  inputSchema: seedLocationSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await seedLocation(ctx.campaignId, { id: ctx.actorId, role: ctx.actorRole }, input);
    return { output: { ok: true, ...r }, affected: { locations: [{ id: r.locationId }] } };
  },
};

export const authorVineGoalTool: JewlTool = {
  name: 'author_vine_goal',
  description:
    'Genesis VINES stage. Choose the GOALS of her GRO.vines — what she wants, in her terms, from who she is — one in ' +
    'every slot her seed gives (the result reports slots and used). Goal only: Resistance is the Watcher\'s, Opportunity the godhead\'s — never write either. ' +
    'Marked AI-chosen; a Trailblazer seated in her overwrites them.',
  inputSchema: authorVineGoalSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await authorVineGoals(ctx.campaignId, input);
    return { output: { ok: true, ...r } };
  },
};

// ── Material life (Mike 2026-10-16) ──────────────────────────────────────
// Her whole material reality is built from Σ accumulatedWealth over her
// roots + branches; stock blueprints are free, the instances are the GM's
// KRMA crystallized; the remainder is exchanged into a campaign currency.

export const readLifeBudgetTool: JewlTool = {
  name: 'read_life_budget',
  description:
    'Genesis POSSESSIONS stage. Her LIFE BUDGET: Σ accumulated wealth over her roots and branches, minus the KV of the ' +
    'things she already holds or owns, minus her cash. Read it before building her life and again before you exchange ' +
    'the remainder into cash. Also lists the campaign\'s currencies.',
  inputSchema: z.object({ characterId: z.string().min(1).max(64) }),
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const { characterId } = z.object({ characterId: z.string() }).parse(input);
    const [budget, currencies] = await Promise.all([lifeBudget(characterId), listCurrencies(ctx.campaignId)]);
    return { output: { ok: true, ...budget, currencies: currencies.map(c => ({ id: c.id, code: c.code, name: c.name, symbol: c.symbol, krmaPerUnit: c.krmaPerUnit, scope: c.scope })) } };
  },
};

export const establishCurrencyTool: JewlTool = {
  name: 'establish_currency',
  description:
    'Genesis POSSESSIONS stage (and world-keeping). A currency is a campaign object — a stored-KRMA vehicle; a campaign ' +
    'may have many (earth alone has ~180). A unit has NO fixed value: anchor krmaPerUnit on the KRMA value of objects ' +
    'in THIS campaign\'s time and place — KV IS the price, so krmaPerUnit = Σ KV ÷ Σ price over several graded anchor ' +
    'objects, calculated at the table, never assumed. A unit is a container: the KRMA it stores (plus its paper or metal). Say the anchor ' +
    'objects in note. Re-calling with the same code re-rates it. Never invent currency ITEMS — cash lives on the sheet.',
  inputSchema: establishCurrencySchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await establishCurrency(ctx.campaignId, { id: ctx.actorId, role: ctx.actorRole }, input);
    return { output: { ok: true, created: r.created, currency: { id: r.currency.id, code: r.currency.code, name: r.currency.name, symbol: r.currency.symbol, krmaPerUnit: r.currency.krmaPerUnit } } };
  },
};

export const grantCashTool: JewlTool = {
  name: 'grant_cash',
  description:
    'Genesis POSSESSIONS stage. Give her cash in a campaign currency — what remains of her accumulated wealth once her ' +
    'things are placed, or what her life plainly leaves her holding (a checking account, the tin on the shelf). ' +
    'Negative amounts take. Read read_life_budget first: cash counts against the budget at the currency\'s rate.',
  inputSchema: grantCashSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await grantCash(ctx.campaignId, { id: ctx.actorId, role: ctx.actorRole }, input);
    const id = grantCashSchema.parse(input).characterId;
    return { output: { ok: true, ...r }, affected: { characters: [{ id, changes: ['wealth'] }] } };
  },
};

export const setIncomeTool: JewlTool = {
  name: 'set_income',
  description:
    'Genesis POSSESSIONS stage. What she brings in per campaign year, in a campaign currency, and from what ("barista, ' +
    'Midtown Grounds"). From her current branch and the backstory only. 0 removes the line.',
  inputSchema: setIncomeSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await setIncome(ctx.campaignId, { id: ctx.actorId, role: ctx.actorRole }, input);
    const id = setIncomeSchema.parse(input).characterId;
    return { output: { ok: true, ...r }, affected: { characters: [{ id, changes: ['wealth'] }] } };
  },
};

registerJewlTool(setStartingAgeTool);
registerJewlTool(grantPossessionTool);
registerJewlTool(dropPossessionTool);
registerJewlTool(readLifeBudgetTool);
registerJewlTool(establishCurrencyTool);
registerJewlTool(grantCashTool);
registerJewlTool(setIncomeTool);
registerJewlTool(seedNpcTool);
registerJewlTool(seedLocationTool);
registerJewlTool(authorVineGoalTool);
