/**
 * remove_character_from_canvas — JEWL takes a character card OFF the
 * campaign canvas without deleting the character itself. The character
 * stays ACTIVE, all sheet data preserved; only canvasX/canvasY are
 * stripped so the canvas filter excludes the card.
 *
 * Use when the GM says "take Trayman off the canvas", "remove all the
 * NPCs except Tara", "clear the canvas", etc.
 *
 * Lookup mirrors place_character_on_canvas: id (preferred) or fuzzy
 * name. If a name matches multiple ACTIVE characters, the tool returns
 * the candidates without acting — JEWL should clarify.
 *
 * For bulk "remove all except X" requests, JEWL should first call
 * `list_canvas_characters` to see who's currently on the canvas, then
 * call this tool once per character to remove. We deliberately do NOT
 * accept a list / "except" filter here — keeping the tool single-target
 * makes the audit log readable (one tool call per card removed).
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { removeCanvasPosition } from '@/services/character';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const removeFromCanvasSchema = z
  .object({
    characterId: z.string().min(1).optional(),
    characterName: z.string().min(1).optional(),
  })
  .refine(v => !!v.characterId || !!v.characterName, {
    message: 'characterId or characterName required',
  });

export const removeCharacterFromCanvasTool: JewlTool = {
  name: 'remove_character_from_canvas',
  description:
    'Take a character card OFF the campaign canvas. Resolve by id ' +
    '(preferred) or fuzzy name (case-insensitive substring). The ' +
    'character is untouched — only its canvas position is cleared, so it ' +
    'disappears from the canvas but still exists in the Tapestry and can ' +
    'be re-placed any time via place_character_on_canvas. If a name ' +
    'matches more than one active character, returns the candidates ' +
    'without removing. For "remove all except X" voice asks, first call ' +
    'list_canvas_characters, then call this tool once per character to ' +
    'remove.',
  inputSchema: removeFromCanvasSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = removeFromCanvasSchema.parse(input);

    let target: { id: string; name: string } | null = null;
    if (parsed.characterId) {
      const c = await prisma.character.findUnique({
        where: { id: parsed.characterId },
        select: { id: true, name: true, campaignId: true },
      });
      if (!c) throw new NotFoundError(`Character ${parsed.characterId} not found`);
      if (c.campaignId && c.campaignId !== ctx.campaignId) {
        throw new ValidationError('Character does not belong to this campaign');
      }
      target = { id: c.id, name: c.name };
    } else {
      const name = parsed.characterName!.trim();
      const matches = await prisma.character.findMany({
        where: {
          OR: [{ campaignId: ctx.campaignId }, { campaignId: null }],
          status: { in: ['APPROVED', 'ACTIVE'] },
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
            removed: false,
            reason: 'ambiguous',
            candidates: matches,
            note: `"${name}" matches ${matches.length} active characters; clarify which to remove.`,
          },
        };
      }
      target = matches[0];
    }

    const { character, wasOnCanvas } = await removeCanvasPosition(
      target.id,
      ctx.actorId,
      ctx.actorRole,
    );

    return {
      output: {
        removed: true,
        characterId: character.id,
        name: character.name,
        wasOnCanvas,
        note: wasOnCanvas
          ? `${character.name} removed from canvas.`
          : `${character.name} was not on the canvas — no change.`,
      },
      affected: {
        characters: [{ id: character.id, changes: ['removed from canvas'] }],
      },
    };
  },
};

registerJewlTool(removeCharacterFromCanvasTool);
