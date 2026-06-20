/**
 * place_character_on_canvas — JEWL drops a character card at a specific
 * spot on the campaign canvas, or near a sensible default if the GM
 * doesn't specify coordinates.
 *
 * Per [[canvas-is-the-os-2026-06-03]] JEWL must be able to perform every
 * GM gesture; "drag this card onto the canvas" is one of the most common
 * voice asks ("put Valmir's card on the canvas", "drop Tara next to
 * Trayman"). This tool resolves the character by name or id, picks a
 * non-colliding default position if needed, and writes the canvasX/Y
 * the same way the manual drag does.
 *
 * Lookup by NAME is fuzzy: case-insensitive substring match. If
 * multiple actives match, the tool returns the candidate list and asks
 * JEWL to disambiguate. If exactly one matches, it acts.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { setCanvasPosition } from '@/services/character';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const placeOnCanvasSchema = z.object({
  /** Character id (preferred) OR fuzzy name (case-insensitive substring). */
  characterId: z.string().min(1).optional(),
  characterName: z.string().min(1).optional(),
  /** Optional placement. Omit either for auto-placement near the canvas origin. */
  x: z.number().optional(),
  y: z.number().optional(),
}).refine(
  v => !!v.characterId || !!v.characterName,
  { message: 'characterId or characterName required' },
);

export const placeCharacterOnCanvasTool: JewlTool = {
  name: 'place_character_on_canvas',
  description:
    'Place (or reposition) a character card on the campaign canvas. ' +
    'Resolve the character by id (preferred) or by fuzzy name (case-' +
    'insensitive substring match). If x/y are omitted, the card is ' +
    'placed near the canvas origin with a small offset so it does not ' +
    "stack on top of an existing card. If the name matches more than " +
    'one active character, returns the candidates without placing — ' +
    'reply with a clarifying question. Use this whenever the GM says ' +
    '"put X on the canvas", "drop X here", "show me X", etc.',
  inputSchema: placeOnCanvasSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = placeOnCanvasSchema.parse(input);

    // Resolve target.
    let target: { id: string; name: string } | null = null;
    if (parsed.characterId) {
      const c = await prisma.character.findUnique({
        where: { id: parsed.characterId },
        select: { id: true, name: true, campaignId: true, status: true },
      });
      if (!c) throw new NotFoundError(`Character ${parsed.characterId} not found`);
      if (c.campaignId && c.campaignId !== ctx.campaignId) {
        throw new ValidationError('Character does not belong to this campaign');
      }
      if (c.status !== 'ACTIVE') {
        throw new ValidationError(`Character ${c.name} is not ACTIVE (status=${c.status})`);
      }
      target = { id: c.id, name: c.name };
    } else {
      const name = parsed.characterName!.trim();
      const matches = await prisma.character.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ campaignId: ctx.campaignId }, { campaignId: null }],
          name: { contains: name },
        },
        select: { id: true, name: true },
        take: 6,
      });
      if (matches.length === 0) {
        throw new NotFoundError(`No active character matches "${name}"`);
      }
      if (matches.length > 1) {
        return {
          output: {
            placed: false,
            reason: 'ambiguous',
            candidates: matches,
            note: `"${name}" matches ${matches.length} active characters; clarify which to place.`,
          },
        };
      }
      target = matches[0];
    }

    // Auto-placement: scan existing canvasX values on this campaign's
    // characters and pick a spot off to the right of the last one. Keeps
    // new cards visible without stacking.
    let x = parsed.x;
    let y = parsed.y;
    if (x === undefined || y === undefined) {
      const others = await prisma.character.findMany({
        where: { campaignId: ctx.campaignId, status: 'ACTIVE' },
        select: { data: true },
        take: 50,
      });
      let maxX = 0;
      for (const o of others) {
        try {
          const d = JSON.parse(o.data) as { canvasX?: number };
          if (typeof d.canvasX === 'number' && d.canvasX > maxX) maxX = d.canvasX;
        } catch { /* ignore */ }
      }
      x = x ?? maxX + 320; // standard card width offset
      y = y ?? 80;
    }

    const updated = await setCanvasPosition(target.id, ctx.actorId, ctx.actorRole, { x, y });

    return {
      output: {
        placed: true,
        characterId: updated.id,
        name: updated.name,
        x,
        y,
      },
      affected: {
        characters: [{ id: updated.id, changes: [`placed at (${x}, ${y})`] }],
      },
    };
  },
};

registerJewlTool(placeCharacterOnCanvasTool);
