/**
 * process_death — Lady Death's death-handler tool.
 *
 * Wraps the existing `executeDeathSplit` engine and writes a Lady Death
 * memo into Lady Death's own memory. The wrapping is intentional: the
 * ledger work is canonical, but Lady Death's narrative response — the
 * "gentle hand" memo pattern — belongs in her agent memory, not in the
 * ledger metadata.
 *
 * The death itself (the character status → DEAD update + KRMA split) is
 * performed by `executeDeathSplit`. This tool exists so Lady Death can
 * trigger it from inside the agent loop.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerTool, type ToolContext } from './registry';
import { executeDeathSplit } from '@/services/krma/death-split';

const inputSchema = z.object({
  characterId: z.string().describe('Character about to die'),
  cause: z.string().min(1).max(500).describe('Cause of death — narrative hook'),
  memo: z.string().max(2000).optional().describe('Lady Death\'s "gentle hand" memo — saved to her memory'),
  sessionId: z.string().optional(),
});

registerTool({
  name: 'process_death',
  description: 'Lady Death: process a character\'s death. Executes the KRMA split, updates character.status to DEAD, and saves Lady Death\'s memo about this death to her memory.',
  inputSchema,
  handler: async (input, context: ToolContext) => {
    const { characterId, cause, memo, sessionId } = input as z.infer<typeof inputSchema>;
    const character = await prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new Error(`Character not found: ${characterId}`);
    if (!character.campaignId) throw new Error('Character has no campaign');

    const result = await executeDeathSplit(
      characterId,
      character.campaignId,
      { cause, sessionId },
      context.godHeadId,
    );

    // Lady Death keeps her own running record of deaths, keyed by
    // characterId so the most recent memo wins when she reflects later.
    if (memo) {
      await prisma.godHeadMemory.upsert({
        where: { godHeadId_key: { godHeadId: context.godHeadId, key: `death::${characterId}` } },
        create: {
          godHeadId: context.godHeadId,
          key: `death::${characterId}`,
          value: JSON.stringify({ memo, cause, spiritPackageKV: result.spiritPackageKV, at: new Date().toISOString() }),
        },
        update: {
          value: JSON.stringify({ memo, cause, spiritPackageKV: result.spiritPackageKV, at: new Date().toISOString() }),
        },
      });
    }

    return {
      characterId,
      manifest: result.manifest,
      spiritPackageKV: result.spiritPackageKV,
      transactionCount: result.transactions.length,
    };
  },
});
