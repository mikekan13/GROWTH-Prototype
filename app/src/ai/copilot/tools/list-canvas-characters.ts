/**
 * list_canvas_characters — JEWL asks "which character cards are
 * currently placed on this campaign's canvas?" so he can plan
 * bulk operations like "remove everyone except Valmir and Tara".
 *
 * Returns ACTIVE characters in the current campaign whose data has
 * numeric canvasX AND canvasY — matching the same filter the page
 * uses to decide whether a card renders.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const listCanvasSchema = z.object({}).optional();

export const listCanvasCharactersTool: JewlTool = {
  name: 'list_canvas_characters',
  description:
    'List every character card currently placed on this campaign\'s ' +
    'canvas. Returns id, name, x, y for each. Use before bulk operations ' +
    'like "remove all characters except X" so you know exactly which ' +
    'remove_character_from_canvas calls to make.',
  inputSchema: listCanvasSchema,
  handler: async (_input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    // Match the page.tsx canvas filter:
    //   - characters in this campaign (or campaignId=null orphans)
    //   - APPROVED/ACTIVE auto-show, OR canvasX/Y is set
    //   - hiddenFromCanvas=true excludes regardless
    const characters = await prisma.character.findMany({
      where: {
        OR: [{ campaignId: ctx.campaignId }, { campaignId: null }],
      },
      select: { id: true, name: true, data: true, status: true },
      take: 500,
    });

    const onCanvas: Array<{
      id: string;
      name: string;
      status: string;
      x: number | null;
      y: number | null;
      autoPlaced: boolean;
    }> = [];
    for (const c of characters) {
      let parsed: { canvasX?: unknown; canvasY?: unknown; hiddenFromCanvas?: unknown } | null = null;
      try { parsed = JSON.parse(c.data); } catch { /* skip malformed */ continue; }
      if (parsed?.hiddenFromCanvas === true) continue;
      const hasCoords =
        typeof parsed?.canvasX === 'number' && typeof parsed?.canvasY === 'number';
      const isAutoShow = c.status === 'APPROVED' || c.status === 'ACTIVE';
      if (!hasCoords && !isAutoShow) continue;
      onCanvas.push({
        id: c.id,
        name: c.name,
        status: c.status,
        x: hasCoords ? (parsed!.canvasX as number) : null,
        y: hasCoords ? (parsed!.canvasY as number) : null,
        autoPlaced: !hasCoords,
      });
    }

    return {
      output: {
        count: onCanvas.length,
        characters: onCanvas,
      },
    };
  },
};

registerJewlTool(listCanvasCharactersTool);
