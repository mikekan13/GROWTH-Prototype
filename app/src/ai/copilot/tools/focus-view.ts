/**
 * focus_view + highlight — JEWL drives the stage lights.
 *
 * The storytelling-OS moves: "let me show you the kitchen" pans the
 * GM's camera there; highlight puts a transient glow on an entity while
 * he talks about it. Both are pure SSE broadcasts — the CLIENT resolves
 * the target's live geometry (it alone knows real fan-out/folder rects)
 * and animates. Nothing is persisted; these are gestures, not state.
 */
import 'server-only';
import { z } from 'zod';
import { broadcastEvent } from '@/lib/campaign-stream';
import { registerJewlTool } from './registry';
import { resolveCharacterRef } from './resolve-character';
import { resolveLocationRef } from './create-location';
import { prisma } from '@/lib/db';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

/** Resolve a spoken target to a concrete canvas entity reference. */
async function resolveTarget(
  ctx: JewlToolContext,
  target: string,
): Promise<{ targetType: 'location' | 'node'; targetId: string; name: string } | null> {
  const loc = await resolveLocationRef(ctx.campaignId, target);
  if (loc) return { targetType: 'location', targetId: loc.id, name: loc.name };
  const item = await prisma.campaignItem.findFirst({
    where: { campaignId: ctx.campaignId, OR: [{ id: target.trim() }, { name: target.trim() }] },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true },
  });
  if (item) return { targetType: 'node', targetId: item.id, name: item.name };
  const character = await resolveCharacterRef(ctx.campaignId, target);
  if (character) return { targetType: 'node', targetId: character.id, name: character.name };
  return null;
}

const focusSchema = z.object({
  target: z.string().min(1).describe('Location, item, or character to center the view on — name or id.'),
  zoom: z.number().min(0.2).max(3).optional().describe('Optional zoom level (1 = default; <1 zooms in tighter... omit unless it matters).'),
});

export const focusViewTool: JewlTool = {
  name: 'focus_view',
  description:
    "Pan the GM's canvas view to center on a location, item, or character " +
    '("let me show you the kitchen"). Use when presenting something you ' +
    'built or directing attention during play. The camera move is a ' +
    'gesture — nothing is persisted.',
  inputSchema: focusSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = focusSchema.parse(input);
    const resolved = await resolveTarget(ctx, parsed.target);
    if (!resolved) {
      return { output: { ok: false, reason: `Nothing named "${parsed.target}" on this campaign's canvas.` } };
    }
    broadcastEvent(ctx.campaignId, {
      kind: 'jewl_focus',
      targetType: resolved.targetType,
      targetId: resolved.targetId,
      zoom: parsed.zoom,
    });
    return { output: { ok: true, focused: resolved.name } };
  },
};

const highlightSchema = z.object({
  target: z.string().min(1).describe('Location, item, or character to glow — name or id.'),
  durationMs: z.number().min(500).max(15000).optional().describe('How long the glow lasts (default 4000).'),
});

export const highlightTool: JewlTool = {
  name: 'highlight',
  description:
    'Put a transient teal glow on a location, item, or character on the ' +
    'canvas — pointing at the thing you are talking about. Auto-fades. ' +
    'Pair with focus_view when the target may be off-screen.',
  inputSchema: highlightSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = highlightSchema.parse(input);
    const resolved = await resolveTarget(ctx, parsed.target);
    if (!resolved) {
      return { output: { ok: false, reason: `Nothing named "${parsed.target}" on this campaign's canvas.` } };
    }
    broadcastEvent(ctx.campaignId, {
      kind: 'jewl_highlight',
      targetType: resolved.targetType,
      targetId: resolved.targetId,
      durationMs: parsed.durationMs ?? 4000,
    });
    return { output: { ok: true, highlighted: resolved.name } };
  },
};

registerJewlTool(focusViewTool);
registerJewlTool(highlightTool);
