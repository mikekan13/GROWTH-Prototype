import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isAdminRole } from '@/lib/permissions';

// ── Schemas ──────────────────────────────────────────────────────────────

export const assignResistanceSchema = z.object({
  entityId: z.string().min(1),
  entityType: z.enum(['CHARACTER', 'NPC', 'CREATURE', 'GODHEAD', 'LOCATION', 'ITEM']),
  note: z.string().max(500).optional(),
});

export const removeResistanceSchema = z.object({
  entityId: z.string().min(1),
});

export type AssignResistanceInput = z.infer<typeof assignResistanceSchema>;

// ── Resistance Entity Management ─────────────────────────────────────────

/**
 * Assign an entity as resistance to a goal.
 * GM creates entities (NPCs, creatures, locations) and links them
 * as resistance via EntityRelationship edges.
 *
 * The resistance entity may have its own GRO.vines and custodian God-heads,
 * creating a natural adversarial graph that God-heads can reason about.
 */
export async function assignResistanceEntity(
  goalId: string,
  userId: string,
  userRole: string,
  input: AssignResistanceInput,
) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { character: { include: { campaign: true } } },
  });
  if (!goal) throw new NotFoundError('Goal not found');
  if (goal.status !== 'ACTIVE') {
    throw new ValidationError('Can only assign resistance to active goals');
  }

  // GM or admin only
  const isGM = goal.character.campaign?.gmUserId === userId;
  if (!isGM && !isAdminRole(userRole)) {
    throw new ForbiddenError('Only the GM can assign resistance entities');
  }

  // Create the relationship edge: goal ← resisted_by → entity
  const relationship = await prisma.entityRelationship.upsert({
    where: {
      sourceId_targetId_relationshipType: {
        sourceId: goalId,
        targetId: input.entityId,
        relationshipType: 'resisted_by',
      },
    },
    update: {
      data: input.note ? JSON.stringify({ note: input.note }) : null,
    },
    create: {
      sourceId: goalId,
      sourceType: 'GOAL',
      targetId: input.entityId,
      targetType: input.entityType,
      relationshipType: 'resisted_by',
      campaignId: goal.campaignId,
      strength: 5,
      bidirectional: false,
      data: input.note ? JSON.stringify({ note: input.note }) : null,
    },
  });

  return relationship;
}

/**
 * Remove an entity from a goal's resistance.
 */
export async function removeResistanceEntity(
  goalId: string,
  entityId: string,
  userId: string,
  userRole: string,
) {
  const goal = await prisma.goal.findUnique({
    where: { id: goalId },
    include: { character: { include: { campaign: true } } },
  });
  if (!goal) throw new NotFoundError('Goal not found');

  const isGM = goal.character.campaign?.gmUserId === userId;
  if (!isGM && !isAdminRole(userRole)) {
    throw new ForbiddenError('Only the GM can remove resistance entities');
  }

  const existing = await prisma.entityRelationship.findUnique({
    where: {
      sourceId_targetId_relationshipType: {
        sourceId: goalId,
        targetId: entityId,
        relationshipType: 'resisted_by',
      },
    },
  });

  if (!existing) throw new NotFoundError('Resistance entity not assigned to this goal');

  await prisma.entityRelationship.delete({
    where: { id: existing.id },
  });

  return { removed: true };
}

/**
 * List all resistance entities for a goal.
 * Returns the entities linked via 'resisted_by' relationships.
 */
export async function listResistanceEntities(goalId: string) {
  const relationships = await prisma.entityRelationship.findMany({
    where: {
      sourceId: goalId,
      sourceType: 'GOAL',
      relationshipType: 'resisted_by',
    },
  });

  // Resolve entity names for display
  const entities = await Promise.all(
    relationships.map(async (rel) => {
      let name = `[${rel.targetType}:${rel.targetId}]`;
      let custodianName: string | null = null;

      // Try to resolve character name + custodian
      if (['CHARACTER', 'NPC', 'CREATURE', 'GODHEAD'].includes(rel.targetType)) {
        const char = await prisma.character.findUnique({
          where: { id: rel.targetId },
          select: { name: true, entityType: true },
        });
        if (char) name = char.name;

        // Check if this entity has goals with custodians
        const entityGoals = await prisma.goal.findMany({
          where: { characterId: rel.targetId, status: 'ACTIVE', custodianId: { not: null } },
          select: { custodianName: true },
          take: 1,
        });
        if (entityGoals.length > 0) {
          custodianName = entityGoals[0].custodianName;
        }
      } else if (rel.targetType === 'LOCATION') {
        const loc = await prisma.location.findUnique({
          where: { id: rel.targetId },
          select: { name: true },
        });
        if (loc) name = loc.name;
      }

      let note: string | undefined;
      if (rel.data) {
        try {
          const parsed = JSON.parse(rel.data) as { note?: string };
          note = parsed.note;
        } catch { /* skip */ }
      }

      return {
        relationshipId: rel.id,
        entityId: rel.targetId,
        entityType: rel.targetType,
        name,
        custodianName,
        note,
      };
    }),
  );

  return entities;
}
