/**
 * Possession service — reads + writes the EntityRelationship rows of
 * relationshipType='owns' that anchor a character to the entities they
 * possess (Locations, CampaignItems, Goals, GodHeads, etc).
 *
 * KRMA value + free-text note live in the relationship's `data` JSON; the
 * possessed entity itself stays normalized in its own table.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canViewCharacter, canEditCharacter } from '@/lib/permissions';

const POSSESSION_REL = 'owns';

const possessionDataSchema = z.object({
  krmaValue: z.number().int().nonnegative().optional(),
  note: z.string().max(2000).optional(),
});
type PossessionData = z.infer<typeof possessionDataSchema>;

export interface PossessionRow {
  id: string;                // EntityRelationship.id (the edge)
  targetId: string;
  targetType: string;
  targetName: string;
  targetSubtype: string | null; // Location.type / CampaignItem.type / etc.
  status: string | null;
  krmaValue: number;
  note: string | null;
  createdAt: string;
  /** Direct children inside this possession (located_at edges). */
  contentsCount: number;
}

function parsePossessionData(raw: string | null): PossessionData {
  if (!raw) return {};
  try {
    const parsed = possessionDataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * List every entity a character possesses, with the target entity's name
 * and type joined in (one query per target type kept small via Map).
 */
export async function listCharacterPossessions(
  characterId: string,
  sessionUserId: string,
  sessionUserRole: string,
): Promise<PossessionRow[]> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      userId: true,
      campaign: { select: { gmUserId: true } },
    },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canViewCharacter(sessionUserId, sessionUserRole, character)) {
    throw new ForbiddenError('You cannot view this character');
  }

  const edges = await prisma.entityRelationship.findMany({
    where: { sourceId: characterId, relationshipType: POSSESSION_REL },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      targetId: true,
      targetType: true,
      data: true,
      createdAt: true,
    },
  });
  if (edges.length === 0) return [];

  // Group target IDs by type so we can batch-fetch each table.
  const byType = new Map<string, string[]>();
  for (const e of edges) {
    const arr = byType.get(e.targetType) ?? [];
    arr.push(e.targetId);
    byType.set(e.targetType, arr);
  }

  type Target = { name: string; subtype: string | null; status: string | null };
  const targetsById = new Map<string, Target>();

  if (byType.has('LOCATION')) {
    const ids = byType.get('LOCATION')!;
    const rows = await prisma.location.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, type: true, status: true },
    });
    for (const r of rows) targetsById.set(r.id, { name: r.name, subtype: r.type, status: r.status });
  }
  if (byType.has('ITEM') || byType.has('CAMPAIGN_ITEM')) {
    const ids = [...(byType.get('ITEM') ?? []), ...(byType.get('CAMPAIGN_ITEM') ?? [])];
    const rows = await prisma.campaignItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, type: true, status: true },
    });
    for (const r of rows) targetsById.set(r.id, { name: r.name, subtype: r.type, status: r.status });
  }
  if (byType.has('GODHEAD')) {
    const ids = byType.get('GODHEAD')!;
    const rows = await prisma.godHead.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, pillar: true },
    });
    for (const r of rows) targetsById.set(r.id, { name: r.name, subtype: r.pillar, status: null });
  }
  if (byType.has('GOAL')) {
    const ids = byType.get('GOAL')!;
    const rows = await prisma.goal.findMany({
      where: { id: { in: ids } },
      select: { id: true, description: true, status: true },
    });
    for (const r of rows) targetsById.set(r.id, { name: r.description.slice(0, 80), subtype: null, status: r.status });
  }
  if (byType.has('CHARACTER') || byType.has('NPC')) {
    const ids = [...(byType.get('CHARACTER') ?? []), ...(byType.get('NPC') ?? [])];
    const rows = await prisma.character.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, entityType: true, status: true },
    });
    for (const r of rows) targetsById.set(r.id, { name: r.name, subtype: r.entityType, status: r.status });
  }

  // Per-possession contents count via single grouped query.
  const targetIds = edges.map(e => e.targetId);
  const grouped = await prisma.entityRelationship.groupBy({
    by: ['targetId'],
    where: { targetId: { in: targetIds }, relationshipType: 'located_at' },
    _count: { _all: true },
  });
  const countByTargetId = new Map<string, number>();
  for (const g of grouped) countByTargetId.set(g.targetId, g._count._all);

  return edges.map((e): PossessionRow => {
    const data = parsePossessionData(e.data);
    const target = targetsById.get(e.targetId) ?? { name: '(missing entity)', subtype: null, status: null };
    return {
      id: e.id,
      targetId: e.targetId,
      targetType: e.targetType,
      targetName: target.name,
      targetSubtype: target.subtype,
      status: target.status,
      krmaValue: data.krmaValue ?? 0,
      note: data.note ?? null,
      createdAt: e.createdAt.toISOString(),
      contentsCount: countByTargetId.get(e.targetId) ?? 0,
    };
  });
}

const createPossessionSchema = z.object({
  targetId: z.string().min(1),
  targetType: z.enum(['LOCATION', 'CAMPAIGN_ITEM', 'GODHEAD', 'GOAL', 'CHARACTER', 'NPC']),
  krmaValue: z.number().int().nonnegative().optional(),
  note: z.string().max(2000).optional(),
});
export type CreatePossessionInput = z.infer<typeof createPossessionSchema>;

export async function createPossession(
  characterId: string,
  sessionUserId: string,
  sessionUserRole: string,
  input: CreatePossessionInput,
) {
  const parsed = createPossessionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid possession payload');

  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, userId: true, campaignId: true, campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(sessionUserId, sessionUserRole, character)) {
    throw new ForbiddenError('You cannot edit this character');
  }

  const existing = await prisma.entityRelationship.findFirst({
    where: { sourceId: characterId, targetId: parsed.data.targetId, relationshipType: POSSESSION_REL },
    select: { id: true },
  });
  const data = JSON.stringify({ krmaValue: parsed.data.krmaValue, note: parsed.data.note });
  if (existing) {
    return prisma.entityRelationship.update({
      where: { id: existing.id },
      data: { data, strength: 10 },
    });
  }
  return prisma.entityRelationship.create({
    data: {
      campaignId: character.campaignId,
      sourceId: characterId,
      sourceType: 'CHARACTER',
      targetId: parsed.data.targetId,
      targetType: parsed.data.targetType,
      relationshipType: POSSESSION_REL,
      strength: 10,
      bidirectional: false,
      data,
    },
  });
}

export async function deletePossession(
  characterId: string,
  edgeId: string,
  sessionUserId: string,
  sessionUserRole: string,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { id: true, userId: true, campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(sessionUserId, sessionUserRole, character)) {
    throw new ForbiddenError('You cannot edit this character');
  }

  const edge = await prisma.entityRelationship.findUnique({
    where: { id: edgeId },
    select: { id: true, sourceId: true, relationshipType: true },
  });
  if (!edge || edge.sourceId !== characterId || edge.relationshipType !== POSSESSION_REL) {
    throw new NotFoundError('Possession edge not found');
  }
  return prisma.entityRelationship.delete({ where: { id: edgeId } });
}
