/**
 * search_blueprints — Fuzzy search ForgeItems by name/type/scope.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool } from './registry';

const inputSchema = z.object({
  query: z.string().describe('Case-insensitive substring of the blueprint name').optional(),
  type: z.enum(['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn']).describe('Filter by blueprint type').optional(),
  scope: z.enum(['global', 'campaign', 'all']).describe('global = catalog-wide, campaign = scoped, all = both').optional(),
  campaignId: z.string().describe('Required if scope is "campaign"').optional(),
  status: z.enum(['draft', 'published', 'global']).describe('Filter by status').optional(),
  decayStatus: z.enum(['ACTIVE', 'FLAGGED', 'DISSOLVING', 'DISSOLVED']).describe('Filter by Lady Death decay state').optional(),
  limit: z.number().describe('Max results (default 20, max 100)').optional(),
});

registerTool({
  name: 'search_blueprints',
  description: 'Search the forge catalog (ForgeItems). Returns lean rows — name, type, status, KV, use count, decay. Use this to find blueprints before reading them in full.',
  inputSchema,
  handler: async (input) => {
    const { query, type, scope, campaignId, status, decayStatus, limit } =
      input as z.infer<typeof inputSchema>;
    const take = Math.min(Math.max(limit ?? 20, 1), 100);

    const where: Record<string, unknown> = {};
    if (query) where.name = { contains: query };
    if (type) where.type = type;
    if (status) where.status = status;
    if (decayStatus) where.decayStatus = decayStatus;

    if (scope === 'global') where.isGlobal = true;
    else if (scope === 'campaign') {
      if (!campaignId) throw new Error('campaignId required when scope is "campaign"');
      where.campaignId = campaignId;
    }
    // scope 'all' or undefined — no filter

    const items = await prisma.forgeItem.findMany({
      where,
      orderBy: [{ useCount: 'desc' }, { updatedAt: 'desc' }],
      take,
      select: {
        id: true,
        type: true,
        name: true,
        status: true,
        campaignId: true,
        isGlobal: true,
        authorUserId: true,
        useCount: true,
        karmicValue: true,
        decayStatus: true,
        lastUsedAt: true,
        evaluatedAt: true,
        updatedAt: true,
      },
    });

    return {
      count: items.length,
      blueprints: items.map(i => ({
        id: i.id,
        type: i.type,
        name: i.name,
        status: i.status,
        campaignId: i.campaignId,
        isGlobal: i.isGlobal,
        authorUserId: i.authorUserId,
        useCount: i.useCount,
        karmicValue: i.karmicValue?.toString() ?? null,
        decayStatus: i.decayStatus,
        lastUsedAt: i.lastUsedAt?.toISOString() ?? null,
        evaluatedAt: i.evaluatedAt?.toISOString() ?? null,
        updatedAt: i.updatedAt.toISOString(),
      })),
    };
  },
});
