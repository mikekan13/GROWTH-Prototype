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
import { grantPossession, grantPossessionSchema } from '@/services/genesis-possessions';
import { seedLocation, seedLocationSchema, seedNpc, seedNpcSchema } from '@/services/genesis-seeds';
import { authorVineGoals, authorVineGoalSchema } from '@/services/genesis-vines';
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
    'Genesis VINES stage. Choose the GOALS of her GRO.vines — what she wants, in her terms, from who she is — up to ' +
    'her seed\'s slots. Goal only: Resistance is the Watcher\'s, Opportunity the godhead\'s — never write either. ' +
    'Marked AI-chosen; a Trailblazer seated in her overwrites them.',
  inputSchema: authorVineGoalSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const r = await authorVineGoals(ctx.campaignId, input);
    return { output: { ok: true, ...r } };
  },
};

registerJewlTool(setStartingAgeTool);
registerJewlTool(grantPossessionTool);
registerJewlTool(seedNpcTool);
registerJewlTool(seedLocationTool);
registerJewlTool(authorVineGoalTool);
