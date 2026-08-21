/**
 * propose_thorn_imposition — the lien half of the proxy-war economy.
 *
 * Creates a STRUCTURED imposition proposal in the godhead→GM channel.
 * Nothing touches the character sheet until the GM confirms on the canvas
 * (services/thorn-imposition.ts resolves it). THE SIZING LAW (Mike
 * 2026-08-21): lien = min(Kai's grade of the wound, the winner's attested
 * stake) — a zero-stake winner imposes a scar with NO creditor. No KRMA
 * moves at imposition (lock model); liens settle through death by pillar.
 */
import 'server-only';
import { z } from 'zod';
import { registerTool } from './registry';
import { proposeThornImposition, impositionSchema } from '@/services/thorn-imposition';
import { TRAIT_CATEGORIES } from '@/types/growth';

const inputSchema = z.object({
  campaignId: z.string().describe('Campaign the character belongs to.'),
  characterId: z.string().describe('Character receiving the Thorn.'),
  goalId: z.string().optional().describe('The failed goal this claim arises from, if any.'),
  name: z.string().describe('Thorn name — evocative, bearer-agnostic rule text.'),
  pillar: z.enum(['body', 'spirit', 'soul']).describe('Pillar the wound truly lives in — routes the death engine: body = holder cashes out the full lien at death; soul (mind/identity — trauma and grief live here) = half payment + a faded residue rides the ghost; spirit (essence) = only essence-fracturing trauma — the lien rides whole across lives, no payment.'),
  category: z.enum(TRAIT_CATEGORIES).optional().describe('Trait category (defaults to utility).'),
  mechanicalEffect: z.string().describe("The rule text. Bearer-agnostic ('the bearer …'), binary triggers, easy to track at the table."),
  rollModifiers: z.array(z.object({
    flat: z.number().int().max(-1).describe('Flat PENALTY to matching rolls (negative — INV-29: negatives live only on Thorns).'),
    skillNamePattern: z.string().optional().describe("Substring match on the rolled skill name; pipe alternatives allowed. Set EITHER this OR governorAttribute — setting both means BOTH must match (AND)."),
    governorAttribute: z.string().optional().describe('Match by governor attribute instead (e.g. willpower).'),
    label: z.string().optional(),
  })).optional().describe('Machine-enforceable hooks — the part the dice engine applies automatically.'),
  kaiGradeKV: z.number().int().min(1).describe("Kai's case-by-case grade of the natural wound's KV magnitude."),
  stakeKV: z.number().int().min(0).describe('Your attested stake in this opposition (ledgered spend once the opportunity economy lands; manual attestation until then). The lien = min(kaiGradeKV, stakeKV) — 0 stake = scar with no creditor.'),
  stakeNote: z.string().describe('How the stake was attested — recorded verbatim on the trait for the audit trail.'),
  lienOrigin: z.enum(['opposition-win', 'fated-age', 'bestowed', 'other']).optional().describe("How the claim arose. 'fated-age' is Lady Death's claim-marker species: removed unpaid when she collects."),
  reason: z.string().describe('One paragraph for the GM: why this Thorn, tied to what happened in play.'),
});

registerTool({
  name: 'propose_thorn_imposition',
  description:
    'Propose imposing a diegetic Thorn on a character with a claimed lien (normally after winning ' +
    'an opposition when a goal fails). The GM sees a structured confirmation card; on accept the ' +
    'thorn lands with lien = min(kaiGradeKV, stakeKV) held by YOU — no KRMA moves now (lock model); ' +
    'the claim settles through death by pillar. On decline nothing lands. Does NOT mutate anything itself.',
  inputSchema,
  handler: async (input, context) => {
    const { campaignId, characterId, goalId, name, pillar, category, mechanicalEffect, rollModifiers, kaiGradeKV, stakeKV, stakeNote, lienOrigin, reason } =
      input as z.infer<typeof inputSchema>;
    const payload = impositionSchema.parse({
      characterId, goalId, kaiGradeKV, stakeKV, stakeNote, reason,
      ...(lienOrigin ? { lienOrigin } : {}),
      thorn: { name, pillar, category, mechanicalEffect, rollModifiers },
    });
    const { messageId, lienKV } = await proposeThornImposition(
      context.godHeadId,
      campaignId,
      payload,
      context.invocationId,
    );
    return { messageId, proposed: true, lienKV, awaiting: 'GM confirmation' };
  },
});
