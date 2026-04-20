/**
 * read_entity — Fetch a character/entity record and return structured data.
 *
 * The agent decides what to look at. We return the raw data, not a
 * pre-baked context string. The agent extracts what it needs.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';
import type { GrowthCharacter } from '@/types/growth';

const inputSchema = z.object({
  entityId: z.string().describe('The character/entity ID to look up'),
});

registerTool({
  name: 'read_entity',
  description: 'Read a character or entity record. Returns identity, attributes, skills, traits, GRO.vines, vitals, and creation data. Use this to understand a character before making decisions about them.',
  inputSchema,
  handler: async (input) => {
    const { entityId } = input as z.infer<typeof inputSchema>;

    const character = await prisma.character.findUnique({
      where: { id: entityId },
      include: {
        campaign: { select: { id: true, name: true } },
        goals: { where: { status: 'ACTIVE' } },
        backstory: { select: { narrative: true, status: true } },
      },
    });

    if (!character) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const data = (typeof character.data === 'string'
      ? JSON.parse(character.data)
      : character.data) as GrowthCharacter;

    return {
      id: character.id,
      name: character.name,
      entityType: character.entityType,
      status: character.status,
      campaignId: character.campaignId,
      campaignName: character.campaign?.name,

      // Identity
      identity: data.identity,
      fatedAge: data.fatedAge,
      tkv: data.tkv,

      // Creation
      seed: data.creation?.seed,
      root: data.creation?.root,
      branches: data.creation?.branches,

      // Attributes (current state)
      attributes: data.attributes,
      conditions: data.conditions,

      // Capabilities
      skills: data.skills,
      magic: data.magic,

      // Traits (nectars + blossoms + thorns)
      traits: data.traits,

      // Narrative
      grovines: data.grovines,
      activeGoals: character.goals.map(g => ({
        id: g.id,
        description: g.description,
        status: g.status,
        priority: g.priority,
        custodianId: g.custodianId,
        custodianName: g.custodianName,
        pillar: g.pillar,
      })),
      backstoryNarrative: character.backstory?.narrative,

      // Vitals
      vitals: data.vitals,
      inventory: data.inventory,
    };
  },
});
