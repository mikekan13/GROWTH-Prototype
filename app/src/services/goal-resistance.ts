import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isAdminRole } from '@/lib/permissions';
import { calculateTKV } from '@/services/krma/evaluator';
import { calculateItemKV, calculateLocationKV } from '@/lib/kv-calculator';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';
import type { GrowthLocation } from '@/types/location';

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
        kv: await entityKV(rel.targetType, rel.targetId),
      };
    }),
  );

  return entities;
}

/**
 * An entity's KV for resistance purposes. Canon (SC-0276, restored
 * 2026-08-19): resistance is "the counter cumulative KV of that Goal" — the
 * summed KRMA of everything the GM stacked against it. Characters/NPCs/
 * creatures compute TKV from their sheet; locations and items from their
 * data. Unparseable/ungraded → null (surfaced, never silently zero).
 */
async function entityKV(targetType: string, targetId: string): Promise<number | null> {
  try {
    if (['CHARACTER', 'NPC', 'CREATURE', 'GODHEAD'].includes(targetType)) {
      const char = await prisma.character.findUnique({
        where: { id: targetId },
        select: { data: true },
      });
      if (!char?.data) return null;
      const parsed = JSON.parse(char.data) as GrowthCharacter;
      return calculateTKV(parsed).total;
    }
    if (targetType === 'LOCATION') {
      const loc = await prisma.location.findUnique({
        where: { id: targetId },
        select: { data: true },
      });
      if (!loc?.data) return null;
      return calculateLocationKV(JSON.parse(loc.data) as GrowthLocation);
    }
    if (targetType === 'ITEM') {
      const item = await prisma.campaignItem.findUnique({
        where: { id: targetId },
        select: { data: true },
      });
      if (!item?.data) return null;
      return calculateItemKV(JSON.parse(item.data) as GrowthWorldItem);
    }
    return null;
  } catch {
    return null;
  }
}

export interface GoalResistanceKV {
  /** The resistance number: Σ KV of all linked resistance entities. */
  totalKV: number;
  entityCount: number;
  /** Entities whose KV couldn't be computed — they contribute 0 to the
   *  total but are counted here so nobody mistakes a grading debt for
   *  weak opposition. */
  ungraded: number;
  entities: Array<{ entityId: string; entityType: string; name: string; kv: number | null }>;
}

/** "How much resistance was against this particular goal?" — the number. */
export async function computeGoalResistanceKV(goalId: string): Promise<GoalResistanceKV> {
  const entities = await listResistanceEntities(goalId);
  const totalKV = entities.reduce((a, e) => a + (e.kv ?? 0), 0);
  return {
    totalKV,
    entityCount: entities.length,
    ungraded: entities.filter(e => e.kv == null).length,
    entities: entities.map(e => ({ entityId: e.entityId, entityType: e.entityType, name: e.name, kv: e.kv })),
  };
}
