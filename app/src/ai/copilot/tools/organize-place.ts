/**
 * organize_place — JEWL plans a WHOLE place once; code applies it (Mike
 * 2026-10-16: "why did he stop... it took him a very long time... we need a
 * way to make this extremely quick"). One call carries the rooms, every
 * placement, the room descriptions and the state facts. Placement facts are
 * DERIVED from the map by the service — JEWL never writes "X is in Y" by
 * hand — so edges, facts and prose cannot disagree
 * ([[ruling-novels-are-worlds-canvas-is-the-map-consistency-2026-10-16]]).
 */
import { z } from 'zod';
import { isWatcherOrAbove } from '@/lib/permissions';
import { applyLayout } from '@/services/placement';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  rooms: z.array(z.object({
    name: z.string().min(1).max(200),
    parent: z.string().min(1).max(200).describe('The Location (name/id) this room lies inside — the home, the floor, the building.'),
    description: z.string().max(2000).optional().describe('The truth of the room, present tense, concrete.'),
  })).max(50).optional().describe('Rooms to ensure. An existing name is reused, never duplicated.'),
  placements: z.array(z.object({
    item: z.string().min(1).max(200).describe('The thing (exact local name or id).'),
    into: z.string().min(1).max(200).describe('A room (Location name/id) or a container item (name/id).'),
  })).max(200).optional().describe('Every thing → where it sits. Order: furniture and containers into rooms FIRST, then contents into their containers.'),
  descriptions: z.array(z.object({
    location: z.string().min(1).max(200),
    description: z.string().max(2000),
  })).max(50).optional().describe('Rewrite a Location\'s description from the map: what is in it and where, present tense, no feelings.'),
  facts: z.array(z.object({
    subjectKey: z.string().min(1).max(200).describe('Dotted key under the prefix, e.g. "violet_apartment.desk" — STATE only.'),
    fact: z.string().min(1).max(1000),
  })).max(100).optional().describe('STATE facts only: surfaces, condition, sounds, light, what a thing looks like. NOT where a thing is — placement facts are derived from the map and a colliding key is rejected.'),
  factPrefix: z.string().max(120).optional().describe('The key prefix this place\'s facts already use (e.g. "violet_apartment"). Defaults to the root Location\'s slug.'),
});

export const organizePlaceTool: JewlTool = {
  name: 'organize_place',
  description:
    'Organize a whole place in ONE call — plan it fully, then send it: rooms (child Locations of the home), ' +
    'then every placement (furniture and containers into rooms, contents into their containers; nothing left loose ' +
    '"at the apartment"), then each room\'s description written FROM that layout, then STATE facts. The world is a ' +
    'top-down map: a thing sits in a room or inside another thing. Placement facts ("X is in the Kitchenette, inside ' +
    'the drawer") are DERIVED from the map by this tool, one key per thing — do not write them; write only state ' +
    '(surfaces, condition, light, sound) under other keys. Use this instead of many move_item / update_location / ' +
    'establish_world_facts rounds. Returns what was created, placed, described, written, and any rejected keys.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: { ok: false, reason: 'Not authorized to organize this place.' } };
    }
    const plan = inputSchema.parse(input);
    const report = await applyLayout(ctx.campaignId, { userId: ctx.actorId, role: ctx.actorRole }, plan);
    return {
      output: { ok: report.errors.length === 0, ...report },
      affected: {},
    };
  },
};

registerJewlTool(organizePlaceTool);
