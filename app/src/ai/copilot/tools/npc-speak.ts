/**
 * npc_speak — JEWL voices an NPC at the table.
 *
 * Per [[jewl-full-vision-2026-06-14]] NPC actuation is a Day-1 lane: JEWL
 * runs every active NPC unless a GM toggle says otherwise (see
 * [[ai-two-layers-and-universal-character-log]]). This is the MVP: a single
 * tool that lets him post one utterance attributed to a specific NPC. The
 * speech lands in the campaign event stream as `chat` with actor=ai_copilot
 * and characterId=<NPC>, so the existing terminal/event UI broadcasts it
 * to players without any new surface.
 *
 * Future lifts: action verbs (`npc_act`), reactive NPC autonomous ticks,
 * AI-mode toggle integration so JEWL only puppets NPCs whose
 * `aiActionMode=true`.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ValidationError, NotFoundError } from '@/lib/errors';
import { createCampaignEvent } from '@/services/campaign-event';
import { getJewlGodHead } from '@/ai/copilot/jewl-identity';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

export const npcSpeakInputSchema = z.object({
  /** Character.id of the NPC. Must be an NPC entityType — PCs are not puppeted. */
  npcCharacterId: z.string().min(1),
  /** What the NPC says. Plain text, single utterance. */
  content: z.string().min(1).max(2000),
  /**
   * Optional tone hint surfaced in the payload for clients that want to
   * render speech differently (whispered/shouted/etc.). Not validated
   * beyond a length cap — JEWL picks the vocabulary.
   */
  tone: z.string().max(64).optional(),
});

export const npcSpeakTool: JewlTool = {
  name: 'npc_speak',
  description:
    'Voice an NPC at the table. Posts one utterance attributed to the named ' +
    'NPC into the campaign event stream — players see it immediately. Use ' +
    'this when narration calls for the NPC to talk; one tool call per ' +
    'distinct utterance (back-to-back lines from the same NPC can each be ' +
    'their own call). The npcCharacterId must be an NPC (entityType=NPC), ' +
    'not a PC or GodHead. Tone is optional flavor ("whispered", "shouted", ' +
    '"dryly"); keep it short.',
  inputSchema: npcSpeakInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = npcSpeakInputSchema.parse(input);

    const npc = await prisma.character.findUnique({
      where: { id: parsed.npcCharacterId },
      select: {
        id: true,
        name: true,
        entityType: true,
        campaignId: true,
        status: true,
      },
    });
    if (!npc) throw new NotFoundError('NPC character not found');
    if (npc.entityType !== 'NPC') {
      throw new ValidationError(
        `Cannot puppet entityType=${npc.entityType}; npc_speak requires entityType=NPC`,
      );
    }
    if (npc.campaignId && npc.campaignId !== ctx.campaignId) {
      throw new ValidationError('NPC does not belong to this campaign');
    }
    if (npc.status !== 'ACTIVE') {
      throw new ValidationError(`NPC is not ACTIVE (status=${npc.status})`);
    }

    // JEWL's GodHead row supplies the actorUserId so the event stream knows
    // it was the universal copilot doing the puppeting, not an anonymous AI.
    const jewl = await getJewlGodHead();

    const event = await createCampaignEvent({
      campaignId: ctx.campaignId,
      type: 'chat',
      actor: 'ai_copilot',
      actorUserId: jewl.characterUserId,
      actorName: 'JEWL',
      characterId: npc.id,
      characterName: npc.name,
      payload: {
        kind: 'chat',
        message: parsed.tone ? `(${parsed.tone}) ${parsed.content}` : parsed.content,
      },
    });

    return {
      output: {
        eventId: event.id,
        npcCharacterId: npc.id,
        npcName: npc.name,
        spoke: parsed.content,
      },
      affected: {
        characters: [{ id: npc.id, changes: ['spoke'] }],
      },
    };
  },
};

registerJewlTool(npcSpeakTool);
