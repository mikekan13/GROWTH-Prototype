import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isWatcherOrAbove } from '@/lib/permissions';
import { emit as emitGodHeadEvent } from '@/services/godhead-dispatcher';

// Content schemas live in forge-schemas.ts (no server-only deps) so
// scripts can import the same validation gate. Re-exported for callers.
import { validateForgeData, FORGE_ITEM_TYPES } from './forge-schemas';
import type { ForgeItemType } from './forge-schemas';
export { validateForgeData, FORGE_ITEM_TYPES, forgeSpellDataSchema } from './forge-schemas';
export type { ForgeItemType } from './forge-schemas';

export const createForgeItemSchema = z.object({
  type: z.enum(FORGE_ITEM_TYPES),
  name: z.string().min(1, 'Name required').max(100),
  data: z.record(z.string(), z.unknown()),
});

export const updateForgeItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const createPlayerRequestSchema = z.object({
  type: z.enum(FORGE_ITEM_TYPES),
  name: z.string().min(1, 'Name required').max(100),
  data: z.record(z.string(), z.unknown()),
});

export const updatePlayerRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const resolvePlayerRequestSchema = z.object({
  status: z.enum(['approved', 'denied', 'modified']),
  gmNotes: z.string().max(1000).optional(),
  modifiedData: z.record(z.string(), z.unknown()).optional(),
  modifiedName: z.string().min(1).max(100).optional(),
});

// ── Permission Helpers ────────────────────────────────────────────────────

async function assertCampaignGM(campaignId: string, userId: string, userRole: string) {
  if (!isWatcherOrAbove(userRole)) throw new ForbiddenError();
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign) throw new NotFoundError('Campaign');
  if (campaign.gmUserId !== userId) throw new ForbiddenError('Only the campaign GM can do this');
  return campaign;
}

async function assertCampaignMember(campaignId: string, userId: string) {
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  if (!membership) {
    // Also check if they're the GM
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
    if (!campaign) throw new NotFoundError('Campaign');
    if (campaign.gmUserId !== userId) throw new ForbiddenError('Not a member of this campaign');
  }
}

// ── ForgeItem Service ─────────────────────────────────────────────────────

/**
 * 'material' is a VIEW over the catalog, not a stored type: raw material
 * stock is seeded as type 'item' tagged 'raw-stock' (canon: "materials are
 * potential, items are purpose" — stock quantities price the crafting floor
 * and satisfy item material-coverage gating). The Workshop's Materials tab
 * and JEWL queries still ask for type=material; map it here.
 */
function applyTypeFilter(where: Record<string, unknown>, type?: string) {
  if (!type) return;
  if (type === 'material') {
    where.type = 'item';
    where.data = { contains: '"raw-stock"' };
  } else {
    where.type = type;
  }
}

/**
 * Row → API shape. karmicValue is a Prisma BigInt — returning it raw makes
 * NextResponse.json throw ("Do not know how to serialize a BigInt") AFTER
 * the DB write already happened (bug hunt 2026-08-17, C2/C10/C11). Every
 * mutation path returns through here now.
 */
function serializeForgeItem<T extends { data: string; karmicValue: bigint | null }>(item: T) {
  return {
    ...item,
    karmicValue: item.karmicValue != null ? Number(item.karmicValue) : null,
    data: JSON.parse(item.data) as Record<string, unknown>,
  };
}

export async function listForgeItems(
  campaignId: string,
  userId: string,
  userRole: string,
  filters?: { type?: string; status?: string }
) {
  await assertCampaignMember(campaignId, userId);

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  const isGM = campaign?.gmUserId === userId;

  const where: Record<string, unknown> = { campaignId };
  applyTypeFilter(where, filters?.type);

  // Players only see published items
  if (!isGM) {
    where.status = 'published';
  } else if (filters?.status) {
    where.status = filters.status;
  }

  const items = await prisma.forgeItem.findMany({
    where,
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });

  return items.map(item => ({
    ...item,
    karmicValue: item.karmicValue != null ? Number(item.karmicValue) : null,
    data: JSON.parse(item.data),
  }));
}

export async function getForgeItem(itemId: string, userId: string, _userRole: string) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');

  if (!item.campaignId) throw new ForbiddenError('Global items cannot be accessed through campaign forge');
  await assertCampaignMember(item.campaignId, userId);

  const campaign = await prisma.campaign.findUnique({ where: { id: item.campaignId }, select: { gmUserId: true } });
  const isGM = campaign?.gmUserId === userId;

  if (!isGM && item.status !== 'published') {
    throw new ForbiddenError('This item is not yet published');
  }

  return { ...item, karmicValue: item.karmicValue != null ? Number(item.karmicValue) : null, data: JSON.parse(item.data) };
}

export async function createForgeItem(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof createForgeItemSchema>
) {
  await assertCampaignGM(campaignId, userId, userRole);

  // Validate type-specific data
  const validatedData = validateForgeData(input.type, input.data);

  const item = await prisma.forgeItem.create({
    data: {
      campaignId,
      type: input.type,
      name: input.name,
      status: 'draft',
      data: JSON.stringify(validatedData),
      createdBy: userId,
    },
  });

  return { ...item, data: validatedData };
}

export async function updateForgeItem(
  itemId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof updateForgeItemSchema>
) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');
  if (!item.campaignId) throw new ForbiddenError('Global items cannot be modified through campaign forge');

  await assertCampaignGM(item.campaignId, userId, userRole);

  const updateData: Record<string, unknown> = {};
  if (input.name) updateData.name = input.name;
  if (input.data) {
    const validatedData = validateForgeData(item.type, input.data);
    // Merge over the stored row: Zod strip-mode drops keys it doesn't know
    // (_proposalNote, betaDraft, provenance stamps) — a plain overwrite was
    // silently deleting them on every GM edit (bug hunt L13).
    const original = (() => {
      try { return JSON.parse(item.data) as Record<string, unknown>; } catch { return {}; }
    })();
    updateData.data = JSON.stringify({ ...original, ...validatedData });
  }

  const updated = await prisma.forgeItem.update({
    where: { id: itemId },
    data: updateData,
  });

  return serializeForgeItem(updated);
}

export async function publishForgeItem(itemId: string, userId: string, userRole: string) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');
  if (!item.campaignId) throw new ForbiddenError('Global items use a different publish flow');

  await assertCampaignGM(item.campaignId, userId, userRole);

  const updated = await prisma.forgeItem.update({
    where: { id: itemId },
    data: { status: 'published' },
  });

  // T31: lifecycle emission — godheads see the catalog grow.
  void emitGodHeadEvent('blueprint.published', {
    forgeItemId: updated.id,
    name: updated.name,
    type: updated.type,
    campaignId: updated.campaignId,
  });

  return serializeForgeItem(updated);
}

/**
 * T31 daily sweep: published blueprints never instantiated within the decay
 * window get flagged and routed to Lady Death (blueprint.unused_for_90d).
 * Idempotent — FLAGGED items aren't re-emitted.
 */
export async function sweepUnusedBlueprints(
  windowDays = 90,
): Promise<{ flagged: number }> {
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const stale = await prisma.forgeItem.findMany({
    where: {
      status: 'published',
      useCount: 0,
      decayStatus: 'ACTIVE',
      updatedAt: { lt: cutoff },
      // Stock is free forever (Mike 2026-08-06) — the ADMIN library must
      // never decay. Without this, all 460+ untouched stock rows were one
      // sweep away from Lady Death (bug hunt C6).
      isGlobal: false,
    },
    select: { id: true, name: true, type: true, campaignId: true },
  });
  for (const item of stale) {
    await prisma.forgeItem.update({
      where: { id: item.id },
      data: { decayStatus: 'FLAGGED' },
    });
    void emitGodHeadEvent('blueprint.unused_for_90d', {
      forgeItemId: item.id,
      name: item.name,
      type: item.type,
      campaignId: item.campaignId,
    });
  }
  return { flagged: stale.length };
}

export async function unpublishForgeItem(itemId: string, userId: string, userRole: string) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');
  if (!item.campaignId) throw new ForbiddenError('Global items use a different publish flow');

  await assertCampaignGM(item.campaignId, userId, userRole);

  const updated = await prisma.forgeItem.update({
    where: { id: itemId },
    data: { status: 'draft' },
  });

  return serializeForgeItem(updated);
}

export async function deleteForgeItem(itemId: string, userId: string, userRole: string) {
  const item = await prisma.forgeItem.findUnique({ where: { id: itemId } });
  if (!item) throw new NotFoundError('Forge item');
  if (!item.campaignId) throw new ForbiddenError('Global items cannot be deleted through campaign forge');

  await assertCampaignGM(item.campaignId, userId, userRole);

  if (item.status === 'published') {
    throw new ValidationError('Cannot delete a published item. Unpublish it first.');
  }

  await prisma.forgeItem.delete({ where: { id: itemId } });
  return { deleted: true };
}

// ── PlayerRequest Service ─────────────────────────────────────────────────

export async function listPlayerRequests(
  campaignId: string,
  userId: string,
  userRole: string,
  filters?: { status?: string }
) {
  await assertCampaignMember(campaignId, userId);

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  const isGM = campaign?.gmUserId === userId;

  const where: Record<string, unknown> = { campaignId };
  if (!isGM) where.requesterId = userId; // Players only see their own requests
  if (filters?.status) where.status = filters.status;

  const requests = await prisma.playerRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return requests.map(r => ({
    ...r,
    data: JSON.parse(r.data),
  }));
}

export async function createPlayerRequest(
  campaignId: string,
  userId: string,
  input: z.infer<typeof createPlayerRequestSchema>
) {
  await assertCampaignMember(campaignId, userId);

  // Validate type-specific data
  const validatedData = validateForgeData(input.type, input.data);

  const request = await prisma.playerRequest.create({
    data: {
      campaignId,
      requesterId: userId,
      type: input.type,
      name: input.name,
      status: 'pending',
      data: JSON.stringify(validatedData),
    },
  });

  return { ...request, data: validatedData };
}

export async function updatePlayerRequest(
  requestId: string,
  userId: string,
  input: z.infer<typeof updatePlayerRequestSchema>
) {
  const request = await prisma.playerRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Request');

  // Only the requester can edit, and only while pending
  if (request.requesterId !== userId) throw new ForbiddenError('Not your request');
  if (request.status !== 'pending') throw new ValidationError('Can only edit pending requests');

  const updateData: Record<string, unknown> = {};
  if (input.name) updateData.name = input.name;
  if (input.data) {
    const validatedData = validateForgeData(request.type, input.data);
    updateData.data = JSON.stringify(validatedData);
  }

  const updated = await prisma.playerRequest.update({
    where: { id: requestId },
    data: updateData,
  });

  return { ...updated, data: JSON.parse(updated.data) };
}

export async function resolvePlayerRequest(
  requestId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof resolvePlayerRequestSchema>
) {
  const request = await prisma.playerRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new NotFoundError('Request');

  await assertCampaignGM(request.campaignId, userId, userRole);

  if (request.status !== 'pending') {
    throw new ValidationError('Request has already been resolved');
  }

  const updateData: Record<string, unknown> = {
    status: input.status,
    gmNotes: input.gmNotes || null,
  };

  // On approve or modify: create a ForgeItem from the request. One
  // transaction — the old two-write shape could approve the request while
  // the item create failed on @@unique([campaignId,name,type]) (bug hunt C8).
  try {
    const updated = await prisma.$transaction(async tx => {
      if (input.status === 'approved' || input.status === 'modified') {
        const requestData = JSON.parse(request.data);
        const finalName = input.modifiedName || request.name;
        const finalData = input.modifiedData
          ? validateForgeData(request.type, input.modifiedData)
          : requestData;

        const forgeItem = await tx.forgeItem.create({
          data: {
            campaignId: request.campaignId,
            type: request.type,
            name: finalName,
            status: 'draft', // GM still needs to publish
            data: JSON.stringify(finalData),
            createdBy: userId,
          },
        });

        updateData.forgeItemId = forgeItem.id;
      }

      return tx.playerRequest.update({
        where: { id: requestId },
        data: updateData,
      });
    });

    return { ...updated, data: JSON.parse(updated.data) };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new ValidationError(
        `A ${request.type} named "${input.modifiedName || request.name}" already exists in this campaign — modify the name to approve.`,
      );
    }
    throw e;
  }
}

// ── Global Catalog ──────────────────────────────────────────────────────

export async function listGlobalCatalog(
  type?: string,
  search?: string,
) {
  const where: Record<string, unknown> = {
    isGlobal: true,
    // Match searchGlobalCatalog: drafts never surface in the public catalog
    // (bug hunt L2/L4).
    status: { in: ['published', 'global'] },
  };
  applyTypeFilter(where, type);
  if (search) {
    where.name = { contains: search };
  }

  const items = await prisma.forgeItem.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      data: true,
      useCount: true,
      authorUserId: true,
      karmicValue: true,
      relationshipTags: true,
      isGlobal: true,
      status: true,
      createdAt: true,
    },
    orderBy: { useCount: 'desc' },
    take: 50,
  });

  return items.map(item => ({
    ...item,
    karmicValue: item.karmicValue != null ? Number(item.karmicValue) : null,
    data: JSON.parse(item.data),
  }));
}

/**
 * Catalog search for JEWL: matches the query against name OR data text,
 * so "kitchen" finds items whose description mentions kitchens, not just
 * name matches. Stock in the global catalog is public and KRMA-free
 * (Mike ruling 2026-08-06) — pulling never debits anything.
 */
export async function searchGlobalCatalog(opts: {
  type?: string;
  query?: string;
  /** Controlled trait-category filter (ruled 2026-08-19) — lets Et'herling
   *  and JEWL pull same-category anchors when grading. */
  category?: string;
  limit?: number;
} = {}) {
  const take = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const where: Record<string, unknown> = {
    isGlobal: true,
    status: { in: ['published', 'global'] },
  };
  applyTypeFilter(where, opts.type);
  if (opts.category) {
    where.AND = [{ data: { contains: `"category":"${opts.category}"` } }];
  }
  if (opts.query) {
    where.OR = [
      { name: { contains: opts.query } },
      { data: { contains: opts.query } },
    ];
  }

  const items = await prisma.forgeItem.findMany({
    where,
    select: {
      id: true,
      name: true,
      type: true,
      data: true,
      useCount: true,
      karmicValue: true,
    },
    orderBy: [{ useCount: 'desc' }, { name: 'asc' }],
    take,
  });

  return items.map(item => ({
    ...item,
    karmicValue: item.karmicValue != null ? Number(item.karmicValue) : null,
    data: JSON.parse(item.data) as Record<string, unknown>,
  }));
}

export async function pullFromGlobalCatalog(
  globalItemId: string,
  campaignId: string,
  userId: string,
  userRole: string,
) {
  await assertCampaignGM(campaignId, userId, userRole);

  const globalItem = await prisma.forgeItem.findUnique({
    where: { id: globalItemId },
  });

  if (!globalItem || !globalItem.isGlobal) {
    throw new NotFoundError('Global item not found');
  }

  // Check if already pulled into this campaign
  const existing = await prisma.forgeItem.findFirst({
    where: { campaignId, sourceGlobalId: globalItemId },
  });
  if (existing) {
    return { ...serializeForgeItem(existing), alreadyExists: true };
  }

  // Create campaign-scoped copy. The graded stamps travel with the copy —
  // dropping them left every pulled blueprint with NULL KV and broke royalty
  // attribution (bug hunt C3).
  let copy;
  try {
    copy = await prisma.forgeItem.create({
      data: {
        campaignId,
        type: globalItem.type,
        name: globalItem.name,
        status: 'published',
        data: globalItem.data,
        createdBy: userId,
        sourceGlobalId: globalItemId,
        isGlobal: false,
        karmicValue: globalItem.karmicValue,
        evaluatedAt: globalItem.evaluatedAt,
        authorUserId: globalItem.authorUserId ?? globalItem.createdBy,
        royaltyRate: globalItem.royaltyRate,
      },
    });
  } catch (e) {
    // @@unique([campaignId, name, type]): a concurrent pull, or a campaign
    // item that already uses this name — surface it readably, not as a 500
    // (bug hunt C5/C12).
    if ((e as { code?: string }).code === 'P2002') {
      const collided = await prisma.forgeItem.findFirst({
        where: { campaignId, name: globalItem.name, type: globalItem.type },
      });
      if (collided?.sourceGlobalId === globalItemId) {
        return { ...serializeForgeItem(collided), alreadyExists: true };
      }
      throw new ValidationError(
        `This campaign already has a ${globalItem.type} named "${globalItem.name}" — rename or remove it before pulling the stock version.`,
      );
    }
    throw e;
  }

  // Increment use count on global source
  await prisma.forgeItem.update({
    where: { id: globalItemId },
    data: { useCount: { increment: 1 } },
  });

  return { ...serializeForgeItem(copy), alreadyExists: false };
}
