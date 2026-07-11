/**
 * propose_nectar_bestowal — Kai's landing tool for the M4 golden path.
 *
 * Creates a STRUCTURED bestowal proposal in the godhead→GM channel.
 * Nothing touches the character sheet or the ledger until the GM confirms
 * on the canvas (services/nectar-bestowal.ts resolves it). INV-24: the KV
 * is the godhead's graded judgment, not a formula output.
 */
import 'server-only';
import { z } from 'zod';
import { registerTool } from './registry';
import { proposeNectarBestowal, proposalSchema } from '@/services/nectar-bestowal';

const inputSchema = z.object({
  campaignId: z.string().describe('Campaign the character belongs to.'),
  characterId: z.string().describe('Character receiving the Nectar.'),
  goalId: z.string().optional().describe('The completed goal this rewards, if any.'),
  name: z.string().describe('Nectar name — evocative, bearer-agnostic rule text.'),
  pillar: z.enum(['body', 'spirit', 'soul']).describe('Pillar the Nectar belongs to (routes the death engine).'),
  mechanicalEffect: z.string().describe("The rule text. Bearer-agnostic ('the bearer …'), binary triggers, easy to track at the table."),
  rollModifiers: z.array(z.object({
    flat: z.number().int().describe('Flat bonus/penalty to matching rolls.'),
    skillNamePattern: z.string().optional().describe("Substring match on the rolled skill name; pipe alternatives allowed (e.g. 'stealth' or 'navigation|leadership'). Set EITHER this OR governorAttribute — setting both means BOTH must match (AND)."),
    governorAttribute: z.string().optional().describe('Match by governor attribute instead (e.g. willpower). Avoid combining with skillNamePattern unless you intend an AND.'),
    label: z.string().optional(),
  })).optional().describe('Machine-enforceable hooks — the part the dice engine applies automatically.'),
  kv: z.number().int().min(1).describe('Your graded KRMA value for this Nectar — transfers from YOUR wallet on acceptance.'),
  reason: z.string().describe('One paragraph for the GM: why this Nectar, tied to what the character did.'),
});

registerTool({
  name: 'propose_nectar_bestowal',
  description:
    'Propose bestowing a Nectar on a character (normally rewarding a completed goal). ' +
    'The GM sees a structured confirmation card; on accept the trait lands with its mechanical ' +
    'hook and the KV transfers from your wallet. On decline the character gets the KV as raw ' +
    'max-Frequency KRMA minus the 10% tax. Does NOT mutate anything itself.',
  inputSchema,
  handler: async (input, context) => {
    const { campaignId, characterId, goalId, name, pillar, mechanicalEffect, rollModifiers, kv, reason } =
      input as z.infer<typeof inputSchema>;
    const payload = proposalSchema.parse({
      characterId, goalId, kv, reason,
      nectar: { name, pillar, mechanicalEffect, rollModifiers },
    });
    const { messageId } = await proposeNectarBestowal(
      context.godHeadId,
      campaignId,
      payload,
      context.invocationId,
    );
    return { messageId, proposed: true, awaiting: 'GM confirmation' };
  },
});
