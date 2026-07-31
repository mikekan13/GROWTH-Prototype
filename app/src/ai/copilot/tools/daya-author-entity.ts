/**
 * daya_author_entity — JEWL authoring tool: wrap a Character as a DAYA
 * entity and/or set her soul-level params (WP12 spec §2, Addendum C).
 *
 * Prefers a JEWL-driven dialogue over a bespoke form per Addendum C /
 * AI-forward-creation: a GM can just tell JEWL "make Character X a DAYA
 * entity, introspection 0.4, voice is plain and clipped" and this tool does
 * it. Wraps on first call if not already wrapped (idempotent — see
 * daya/authoring.ts's wrapCharacterAsDaya), then applies whatever authoring
 * fields were supplied. GM/ADMIN only. Everything set here stays
 * live-editable after wake (spec §8) — call again anytime to tune.
 */
import 'server-only';
import { z } from 'zod';
import { isWatcherOrAbove } from '@/lib/permissions';
import { wrapCharacterAsDaya, updateDayaAuthoring } from '@/daya/authoring';
import { registerJewlTool } from './registry';
import { resolveCharacterRef } from './resolve-character';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  ok: false,
  reason: 'Not authorized to author persona-harness entities.',
};

const biasSchema = z.object({
  selfRegard: z.number().min(-1).max(1).optional(),
  optimism: z.number().min(-1).max(1).optional(),
  projection: z.number().min(-1).max(1).optional(),
  denial: z.number().min(-1).max(1).optional(),
  catastrophize: z.number().min(-1).max(1).optional(),
});

const voiceSchema = z.object({
  register: z.string().max(200).optional(),
  rhythm: z.string().max(200).optional(),
  images: z.array(z.string().max(100)).max(10).optional(),
});

const dayaAuthorEntityInputSchema = z.object({
  /** Character id — a name also works (resolved campaign-scoped). */
  characterId: z.string().min(1).describe('Character id or name (e.g. "Violet").'),
  /** 0..1 self-insight capacity — how well she knows herself. */
  introspection: z.number().min(0).max(1).optional(),
  voice: voiceSchema.optional(),
  bias: biasSchema.optional(),
  /** Her self-story, free text. */
  identityNarrative: z.string().max(4000).optional(),
  voiceNotes: z.string().max(2000).optional(),
});

export const dayaAuthorEntityTool: JewlTool = {
  name: 'daya_author_entity',
  description:
    'GM/ADMIN-only. Wraps an existing Character as a persona-harness entity ' +
    '(creates her substrate on first call — safe to call again, a no-op ' +
    'wrap past the first time) and sets the soul-level params the standard ' +
    'sheet does not have: introspection (0..1 self-insight), voice (register/' +
    'rhythm/characteristic images), bias operators (selfRegard/optimism/' +
    'projection/denial/catastrophize, each -1..1), and her identityNarrative ' +
    '(free self-story text). All fields optional and independently settable ' +
    '— call again anytime to tune; nothing here is one-shot.',
  inputSchema: dayaAuthorEntityInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaAuthorEntityInputSchema.parse(input);

    // The model often passes a NAME where the schema says id — resolve
    // either, campaign-scoped, before touching the substrate.
    const resolved = await resolveCharacterRef(ctx.campaignId, parsed.characterId);
    if (!resolved) {
      return {
        output: {
          ok: false,
          reason: `No character "${parsed.characterId}" in this campaign. Use list_canvas_characters or read_actors_state to find the right name/id.`,
        },
      };
    }
    parsed.characterId = resolved.id;

    const wrap = await wrapCharacterAsDaya(parsed.characterId, ctx.actorRole);

    const hasAuthoringFields =
      parsed.introspection !== undefined ||
      parsed.voice !== undefined ||
      parsed.bias !== undefined ||
      parsed.identityNarrative !== undefined ||
      parsed.voiceNotes !== undefined;

    if (!hasAuthoringFields) {
      return {
        output: { ok: true, wrap },
        affected: { characters: [{ id: parsed.characterId, changes: ['daya_wrapped'] }] },
      };
    }

    const update = await updateDayaAuthoring(parsed.characterId, ctx.actorRole, {
      introspection: parsed.introspection,
      voice: parsed.voice,
      bias: parsed.bias,
      identityNarrative: parsed.identityNarrative,
      voiceNotes: parsed.voiceNotes,
    });

    return {
      output: { ok: true, wrap, update },
      affected: { characters: [{ id: parsed.characterId, changes: ['daya_wrapped', 'daya_authored'] }] },
    };
  },
};

registerJewlTool(dayaAuthorEntityTool);
