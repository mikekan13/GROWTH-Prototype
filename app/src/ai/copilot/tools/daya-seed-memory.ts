/**
 * daya_seed_memory — JEWL authoring tool: writes seeded DayaMemoryEntry rows
 * for a persona-harness entity (WP12 spec §2, Addendum C).
 *
 * Lets a GM (via JEWL) give a freshly-authored entity a starting past —
 * "she remembers losing the shop three winters ago" — without roleplaying
 * every beat live first. All content is sealLint-checked (embodiment seal,
 * Ruling 13) before anything is written; a single mechanical-vocabulary hit
 * rejects the WHOLE batch (daya/authoring.ts's seedEntityMemories) so a
 * defect never leaves a partial seed behind. GM/ADMIN only.
 */
import 'server-only';
import { z } from 'zod';
import { isWatcherOrAbove } from '@/lib/permissions';
import { seedEntityMemories } from '@/daya/authoring';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const ROLE_REFUSAL = {
  ok: false,
  reason: 'Not authorized to seed persona-harness memories.',
};

const seedMemorySchema = z.object({
  /** Lived-experience content, first-person-compatible, no mechanical vocabulary. */
  content: z.string().min(1).max(2000),
  valence: z.number().min(-1).max(1).optional(),
  arousal: z.number().min(0).max(1).optional(),
  salience: z.number().min(0).max(1).optional(),
  /** Narrative cycle this memory is anchored to; defaults to the campaign's current cycle. */
  cycle: z.number().optional(),
});

const dayaSeedMemoryInputSchema = z.object({
  characterId: z.string().min(1),
  memories: z.array(seedMemorySchema).min(1).max(20),
});

export const dayaSeedMemoryTool: JewlTool = {
  name: 'daya_seed_memory',
  description:
    'GM/ADMIN-only. Writes one or more seeded memories directly onto a ' +
    'persona-harness entity\'s ledger — content, rough valence (-1..1), ' +
    'arousal (0..1), salience (0..1), and an optional narrative cycle. ' +
    'Requires the character to already be a persona-harness entity (use ' +
    'daya_author_entity first). Content must read as lived first-person ' +
    'experience — no dice/DR/stat/game-master vocabulary; a single ' +
    'mechanical-vocabulary hit anywhere in the batch rejects the whole call ' +
    'so nothing partial gets written.',
  inputSchema: dayaSeedMemoryInputSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    if (!isWatcherOrAbove(ctx.actorRole)) {
      return { output: ROLE_REFUSAL };
    }

    const parsed = dayaSeedMemoryInputSchema.parse(input);
    const written = await seedEntityMemories(parsed.characterId, ctx.actorRole, parsed.memories);

    return {
      output: { ok: true, written },
      affected: { characters: [{ id: parsed.characterId, changes: ['daya_memories_seeded'] }] },
    };
  },
};

registerJewlTool(dayaSeedMemoryTool);
