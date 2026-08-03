/**
 * arrange_canvas — JEWL lays out the stage.
 *
 * The spatial half of world-building: he can CREATE locations, items,
 * and characters, but until now had no way to say WHERE they sit on the
 * canvas. Batch-position anything by name or id: locations get
 * data.canvasX/Y (the anchor their folder renders from), items get
 * data.x/y, characters go through the same setCanvasPosition service
 * the GM's own gesture uses. Client canvases refresh via the standard
 * tool-commit refresh; live folder physics resolves overlaps.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { updateLocation } from '@/services/location';
import { updateCampaignItem } from '@/services/campaign-item';
import { setCanvasPosition } from '@/services/character';
import { registerJewlTool } from './registry';
import { resolveCharacterRef } from './resolve-character';
import { resolveLocationRef } from './create-location';
import type { JewlTool, JewlToolHandlerResult } from './types';

const inputSchema = z.object({
  placements: z
    .array(
      z.object({
        target: z.string().min(1).describe('Location, item, or character — name or id.'),
        x: z.number().describe('Canvas world X.'),
        y: z.number().describe('Canvas world Y. Note: y > 0 is the drafting side of the crystallization line; y < 0 is the active side.'),
      }),
    )
    .min(1)
    .max(40)
    .describe('Batch placements — lay out a whole scene in one call.'),
});

export const arrangeCanvasTool: JewlTool = {
  name: 'arrange_canvas',
  description:
    'Position things spatially on the campaign canvas: locations (their ' +
    'folder anchor), items, and characters, by name or id, in one batch. ' +
    'Use after building a place so the scene is laid out sensibly — rooms ' +
    'side by side inside their parent, objects grouped by zone. The live ' +
    'canvas physics resolves any overlaps you leave.',
  inputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = inputSchema.parse(input);
    const placed: Array<{ target: string; kind: string; id: string }> = [];
    const skipped: Array<{ target: string; reason: string }> = [];

    for (const p of parsed.placements) {
      // Resolution order: location → item → character.
      const loc = await resolveLocationRef(ctx.campaignId, p.target);
      if (loc) {
        const row = await prisma.location.findUniqueOrThrow({ where: { id: loc.id }, select: { data: true } });
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(row.data) as Record<string, unknown>; } catch { /* fresh */ }
        data.canvasX = p.x;
        data.canvasY = p.y;
        await updateLocation(loc.id, ctx.campaignId, ctx.actorId, ctx.actorRole, { data });
        placed.push({ target: p.target, kind: 'location', id: loc.id });
        continue;
      }
      const item = await prisma.campaignItem.findFirst({
        where: {
          campaignId: ctx.campaignId,
          OR: [{ id: p.target.trim() }, { name: p.target.trim() }],
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, data: true },
      });
      if (item) {
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(item.data) as Record<string, unknown>; } catch { /* fresh */ }
        data.x = p.x;
        data.y = p.y;
        await updateCampaignItem(item.id, ctx.campaignId, ctx.actorId, ctx.actorRole, { data });
        placed.push({ target: p.target, kind: 'item', id: item.id });
        continue;
      }
      const character = await resolveCharacterRef(ctx.campaignId, p.target);
      if (character) {
        await setCanvasPosition(character.id, ctx.actorId, ctx.actorRole, { x: p.x, y: p.y });
        placed.push({ target: p.target, kind: 'character', id: character.id });
        continue;
      }
      skipped.push({ target: p.target, reason: 'no location, item, or character by that name/id' });
    }

    return {
      output: { ok: skipped.length === 0, placed, skipped },
      affected: {
        locations: placed.filter(p => p.kind === 'location').map(p => ({ id: p.id })),
        items: placed.filter(p => p.kind === 'item').map(p => ({ id: p.id })),
      },
    };
  },
};

registerJewlTool(arrangeCanvasTool);
