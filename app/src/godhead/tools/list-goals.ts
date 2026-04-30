/**
 * list_goals — Find goals matching filters.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'FAILED', 'ABANDONED']).describe('Filter by status').optional(),
  campaignId: z.string().describe('Filter to a specific campaign').optional(),
  characterId: z.string().describe('Filter to a specific character/entity').optional(),
  custodianId: z.string().describe('Filter by custodian god-head ID. Pass your own ID to find what you custody.').optional(),
  unclaimedOnly: z.boolean().describe('If true, only goals with no custodian').optional(),
  pillar: z.enum(['MERCY', 'BALANCE', 'SEVERITY']).describe('Filter by pillar').optional(),
  limit: z.number().describe('Max results (default 25, max 100)').optional(),
});

registerTool({
  name: 'list_goals',
  description: 'List GRO.vines (goals) matching filters. Returns a summary per goal. Use this to survey the campaign before deciding which goals to adopt or which to propose resistance for.',
  inputSchema,
  handler: async (input) => {
    const { status, campaignId, characterId, custodianId, unclaimedOnly, pillar, limit } =
      input as z.infer<typeof inputSchema>;
    const take = Math.min(Math.max(limit ?? 25, 1), 100);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (campaignId) where.campaignId = campaignId;
    if (characterId) where.characterId = characterId;
    if (pillar) where.pillar = pillar;
    if (unclaimedOnly) where.custodianId = null;
    else if (custodianId) where.custodianId = custodianId;

    const goals = await prisma.goal.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      take,
      select: {
        id: true,
        characterId: true,
        campaignId: true,
        description: true,
        status: true,
        priority: true,
        custodianId: true,
        custodianName: true,
        pillar: true,
        resistancePrompt: true,
        nectarsEarned: true,
        createdAt: true,
        character: { select: { name: true, entityType: true } },
      },
    });

    return {
      count: goals.length,
      goals: goals.map(g => ({
        id: g.id,
        description: g.description,
        status: g.status,
        priority: g.priority,
        characterId: g.characterId,
        characterName: g.character?.name,
        entityType: g.character?.entityType,
        campaignId: g.campaignId,
        custodianId: g.custodianId,
        custodianName: g.custodianName,
        pillar: g.pillar,
        hasResistancePrompt: !!g.resistancePrompt,
        nectarsEarned: g.nectarsEarned,
        createdAt: g.createdAt.toISOString(),
      })),
    };
  },
});
