/**
 * Entity-contents service — reads + writes the EntityRelationship rows
 * of relationshipType='located_at' that anchor child entities (Locations,
 * Characters, CampaignItems, GodHeads, Goals) inside a parent entity
 * (usually a Location, but any entity type that "contains" others).
 *
 * Pattern: child = source, parent = target.
 *   "Malkuth is located_at Tree of Life"
 *   sourceId = Malkuth.id, sourceType = LOCATION
 *   targetId = TreeOfLife.id, targetType = LOCATION
 *   relationshipType = 'located_at'
 *
 * The relationship's `data` JSON carries optional metadata (note, position,
 * etc.). The entities themselves stay normalized in their own tables.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';

const CONTAINS_REL = 'located_at';

const contentsDataSchema = z.object({
  note: z.string().max(2000).optional(),
  position: z.number().int().optional(),
});
type ContentsData = z.infer<typeof contentsDataSchema>;

export type EntityTypeCode = 'LOCATION' | 'CHARACTER' | 'NPC' | 'CAMPAIGN_ITEM' | 'GODHEAD' | 'GOAL';

export interface ContentsRow {
  id: string;                  // EntityRelationship.id
  childId: string;
  childType: EntityTypeCode;
  childName: string;
  childSubtype: string | null;
  childStatus: string | null;
  note: string | null;
  position: number | null;
  /** Number of direct children this child itself contains (for the drill-down UI). */
  childContentsCount: number;
}

function parseContentsData(raw: string | null): ContentsData {
  if (!raw) return {};
  try {
    const parsed = contentsDataSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

async function resolveEntity(entityId: string): Promise<{ type: EntityTypeCode; campaignId: string | null; name: string } | null> {
  // Resolution order: Location first (most common), then Character, then CampaignItem, then GodHead, then Goal.
  const loc = await prisma.location.findUnique({ where: { id: entityId }, select: { campaignId: true, name: true } });
  if (loc) return { type: 'LOCATION', campaignId: loc.campaignId, name: loc.name };
  const char = await prisma.character.findUnique({ where: { id: entityId }, select: { campaignId: true, name: true, entityType: true } });
  if (char) return { type: char.entityType === 'NPC' ? 'NPC' : 'CHARACTER', campaignId: char.campaignId, name: char.name };
  const item = await prisma.campaignItem.findUnique({ where: { id: entityId }, select: { campaignId: true, name: true } });
  if (item) return { type: 'CAMPAIGN_ITEM', campaignId: item.campaignId, name: item.name };
  const gh = await prisma.godHead.findUnique({ where: { id: entityId }, select: { name: true } });
  if (gh) return { type: 'GODHEAD', campaignId: null, name: gh.name };
  const goal = await prisma.goal.findUnique({ where: { id: entityId }, select: { campaignId: true, description: true } });
  if (goal) return { type: 'GOAL', campaignId: goal.campaignId, name: goal.description.slice(0, 80) };
  return null;
}

/**
 * Look up the contents (direct children) of any entity.
 *
 * Permission model: anyone with access to the parent's campaign can read
 * (or admins). Campaign access is checked via the resolved campaignId.
 * For non-campaign-bound parents (e.g. GodHead), require admin.
 */
export async function listEntityContents(
  parentEntityId: string,
  sessionUserId: string,
  sessionUserRole: string,
): Promise<ContentsRow[]> {
  const parent = await resolveEntity(parentEntityId);
  if (!parent) throw new NotFoundError('Parent entity not found');

  // Auth: simplest pass — any campaign member or admin can read contents.
  // GMs can write (separate path). For cross-campaign / orphan parents, require admin.
  if (parent.campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: parent.campaignId },
      select: { gmUserId: true, members: { select: { userId: true, status: true } } },
    });
    if (!campaign) throw new NotFoundError('Campaign for entity not found');
    const isAdmin = sessionUserRole === 'GODHEAD' || sessionUserRole === 'ADMIN';
    const isGM = campaign.gmUserId === sessionUserId;
    const isMember = campaign.members.some(m => m.userId === sessionUserId && !['INTERESTED', 'REJECTED'].includes(m.status));
    if (!isAdmin && !isGM && !isMember) throw new ForbiddenError('You cannot view contents of this entity');
  } else {
    const isAdmin = sessionUserRole === 'GODHEAD' || sessionUserRole === 'ADMIN';
    if (!isAdmin) throw new ForbiddenError('Admin-only entity contents');
  }

  const edges = await prisma.entityRelationship.findMany({
    where: { targetId: parentEntityId, relationshipType: CONTAINS_REL },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      sourceId: true,
      sourceType: true,
      data: true,
    },
  });
  if (edges.length === 0) return [];

  // Batch-load each child's display data by type.
  const byType = new Map<string, string[]>();
  for (const e of edges) {
    const arr = byType.get(e.sourceType) ?? [];
    arr.push(e.sourceId);
    byType.set(e.sourceType, arr);
  }

  type Child = { name: string; subtype: string | null; status: string | null };
  const childrenById = new Map<string, Child>();

  if (byType.has('LOCATION')) {
    const ids = byType.get('LOCATION')!;
    const rows = await prisma.location.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, type: true, status: true },
    });
    for (const r of rows) childrenById.set(r.id, { name: r.name, subtype: r.type, status: r.status });
  }
  if (byType.has('CAMPAIGN_ITEM') || byType.has('ITEM')) {
    const ids = [...(byType.get('CAMPAIGN_ITEM') ?? []), ...(byType.get('ITEM') ?? [])];
    const rows = await prisma.campaignItem.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, type: true, status: true },
    });
    for (const r of rows) childrenById.set(r.id, { name: r.name, subtype: r.type, status: r.status });
  }
  if (byType.has('CHARACTER') || byType.has('NPC')) {
    const ids = [...(byType.get('CHARACTER') ?? []), ...(byType.get('NPC') ?? [])];
    const rows = await prisma.character.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, entityType: true, status: true },
    });
    for (const r of rows) childrenById.set(r.id, { name: r.name, subtype: r.entityType, status: r.status });
  }
  if (byType.has('GODHEAD')) {
    const ids = byType.get('GODHEAD')!;
    const rows = await prisma.godHead.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, pillar: true },
    });
    for (const r of rows) childrenById.set(r.id, { name: r.name, subtype: r.pillar, status: null });
  }
  if (byType.has('GOAL')) {
    const ids = byType.get('GOAL')!;
    const rows = await prisma.goal.findMany({
      where: { id: { in: ids } },
      select: { id: true, description: true, status: true },
    });
    for (const r of rows) childrenById.set(r.id, { name: r.description.slice(0, 80), subtype: null, status: r.status });
  }

  // Count grandchildren per child in one query.
  const childIds = edges.map(e => e.sourceId);
  const grandchildCounts = await prisma.entityRelationship.groupBy({
    by: ['targetId'],
    where: { targetId: { in: childIds }, relationshipType: CONTAINS_REL },
    _count: { _all: true },
  });
  const countByChildId = new Map<string, number>();
  for (const g of grandchildCounts) countByChildId.set(g.targetId, g._count._all);

  return edges.map((e): ContentsRow => {
    const data = parseContentsData(e.data);
    const child = childrenById.get(e.sourceId) ?? { name: '(missing entity)', subtype: null, status: null };
    return {
      id: e.id,
      childId: e.sourceId,
      childType: e.sourceType as EntityTypeCode,
      childName: child.name,
      childSubtype: child.subtype,
      childStatus: child.status,
      note: data.note ?? null,
      position: data.position ?? null,
      childContentsCount: countByChildId.get(e.sourceId) ?? 0,
    };
  });
}

const attachSchema = z.object({
  childId: z.string().min(1),
  childType: z.enum(['LOCATION', 'CHARACTER', 'NPC', 'CAMPAIGN_ITEM', 'GODHEAD', 'GOAL']),
  note: z.string().max(2000).optional(),
  position: z.number().int().optional(),
});
export type AttachEntityInput = z.infer<typeof attachSchema>;

/**
 * Attach a child entity to a parent entity via located_at. GM-only write
 * (use canManageCampaign on the parent's campaign).
 */
export async function attachEntityToParent(
  parentEntityId: string,
  sessionUserId: string,
  sessionUserRole: string,
  input: AttachEntityInput,
) {
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError('Invalid attach payload');

  const parent = await resolveEntity(parentEntityId);
  if (!parent) throw new NotFoundError('Parent entity not found');

  if (parent.campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: parent.campaignId },
      select: { gmUserId: true },
    });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(sessionUserId, sessionUserRole, campaign)) {
      throw new ForbiddenError('Only the GM can modify entity contents');
    }
  } else {
    const isAdmin = sessionUserRole === 'GODHEAD' || sessionUserRole === 'ADMIN';
    if (!isAdmin) throw new ForbiddenError('Admin-only entity');
  }

  if (parsed.data.childId === parentEntityId) {
    throw new ValidationError('Cannot contain self');
  }

  const existing = await prisma.entityRelationship.findFirst({
    where: { sourceId: parsed.data.childId, targetId: parentEntityId, relationshipType: CONTAINS_REL },
    select: { id: true },
  });
  const data = JSON.stringify({ note: parsed.data.note, position: parsed.data.position });
  if (existing) {
    return prisma.entityRelationship.update({
      where: { id: existing.id },
      data: { data },
    });
  }
  return prisma.entityRelationship.create({
    data: {
      campaignId: parent.campaignId,
      sourceId: parsed.data.childId,
      sourceType: parsed.data.childType,
      targetId: parentEntityId,
      targetType: parent.type,
      relationshipType: CONTAINS_REL,
      strength: 5,
      bidirectional: false,
      data,
    },
  });
}

export async function detachEntity(
  parentEntityId: string,
  edgeId: string,
  sessionUserId: string,
  sessionUserRole: string,
) {
  const parent = await resolveEntity(parentEntityId);
  if (!parent) throw new NotFoundError('Parent entity not found');

  if (parent.campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: parent.campaignId },
      select: { gmUserId: true },
    });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(sessionUserId, sessionUserRole, campaign)) {
      throw new ForbiddenError('Only the GM can modify entity contents');
    }
  } else {
    const isAdmin = sessionUserRole === 'GODHEAD' || sessionUserRole === 'ADMIN';
    if (!isAdmin) throw new ForbiddenError('Admin-only entity');
  }

  const edge = await prisma.entityRelationship.findUnique({
    where: { id: edgeId },
    select: { id: true, targetId: true, relationshipType: true },
  });
  if (!edge || edge.targetId !== parentEntityId || edge.relationshipType !== CONTAINS_REL) {
    throw new NotFoundError('Contents edge not found');
  }
  return prisma.entityRelationship.delete({ where: { id: edgeId } });
}
