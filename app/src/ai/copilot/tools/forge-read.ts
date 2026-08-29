/**
 * read_forge_item — fetch the full data block of a Forge item by id or name.
 *
 * Born from the sheet-reconcile block (2026-08-29): campaign-published
 * blocks are invisible to search_catalog (global-only) and
 * list_forge_drafts returns metadata without bodies — JEWL could not read
 * the approved blocks he was ordered to derive a sheet from. Read-only;
 * scope = this campaign's items + the global catalog.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  ref: z.string().min(1).max(120).describe(
    'Forge item id (cuid) or exact name. Names resolve within this campaign first, then the global catalog.',
  ),
  type: z.enum(['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'thorn', 'blossom', 'spell']).optional()
    .describe('Disambiguates name lookups when the same name exists across types.'),
});

export const readForgeItemTool: JewlTool = {
  name: 'read_forge_item',
  description:
    'Read the FULL data of a Forge item (block/trait/item) by id or exact ' +
    'name — campaign items first, then the global catalog. Use this when ' +
    'you need the actual contents of a published or draft block (attribute ' +
    'grants, skills, effects) rather than queue metadata. Read-only.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);
    const typeFilter = parsed.type ? { type: parsed.type } : {};
    const item =
      (await prisma.forgeItem.findUnique({ where: { id: parsed.ref } }).catch(() => null)) ??
      (await prisma.forgeItem.findFirst({
        where: { campaignId: ctx.campaignId, name: parsed.ref, ...typeFilter },
        orderBy: { updatedAt: 'desc' },
      })) ??
      (await prisma.forgeItem.findFirst({
        where: { isGlobal: true, name: parsed.ref, ...typeFilter },
        orderBy: { updatedAt: 'desc' },
      }));
    if (!item) throw new Error(`No forge item found for "${parsed.ref}"${parsed.type ? ` (type ${parsed.type})` : ''}.`);
    if (item.campaignId && item.campaignId !== ctx.campaignId) {
      throw new Error('Item belongs to a different campaign.');
    }
    return {
      output: {
        id: item.id,
        name: item.name,
        type: item.type,
        status: item.status,
        isGlobal: item.isGlobal,
        karmicValue: item.karmicValue !== null ? Number(item.karmicValue) : null,
        data: JSON.parse(item.data),
      },
    };
  },
};

registerJewlTool(readForgeItemTool);
