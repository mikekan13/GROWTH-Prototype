/**
 * read_goal — Full detail on a single goal, including milestones
 * and the resistance edges it has from the relationship graph.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  goalId: z.string().describe('The goal ID to read'),
});

registerTool({
  name: 'read_goal',
  description: 'Read full detail on a goal: description, status, milestones, custodian, resistance plan, and any entities wired as resistance via the graph.',
  inputSchema,
  handler: async (input) => {
    const { goalId } = input as z.infer<typeof inputSchema>;

    const goal = await prisma.goal.findUnique({
      where: { id: goalId },
      include: {
        character: { select: { id: true, name: true, entityType: true } },
        campaign: { select: { id: true, name: true } },
      },
    });
    if (!goal) throw new Error(`Goal not found: ${goalId}`);

    // Parse milestones (stored as JSON string)
    let milestones: unknown = null;
    if (goal.milestones) {
      try {
        milestones = JSON.parse(goal.milestones);
      } catch {
        milestones = goal.milestones;
      }
    }

    // Incoming resistance edges
    const resistance = await prisma.entityRelationship.findMany({
      where: { sourceId: goalId, relationshipType: 'resisted_by' },
    });

    return {
      id: goal.id,
      description: goal.description,
      status: goal.status,
      priority: goal.priority,

      character: goal.character,
      campaign: goal.campaign,

      custodianId: goal.custodianId,
      custodianName: goal.custodianName,
      pillar: goal.pillar,

      resistancePrompt: goal.resistancePrompt,
      resistancePlan: goal.resistancePlan,

      milestones,
      nectarsEarned: goal.nectarsEarned,

      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
      completedAt: goal.completedAt?.toISOString() ?? null,

      resistanceEdges: resistance.map(r => ({
        id: r.id,
        targetId: r.targetId,
        targetType: r.targetType,
        strength: r.strength,
      })),
    };
  },
});
