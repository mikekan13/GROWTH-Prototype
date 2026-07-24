/**
 * preview_cast + resolve_cast — JEWL as the casting co-pilot
 * (r-2026-07-22-01: JEWL co-pilots ALL casting, coaxing school/DR/mana/
 * params from vague player intent).
 *
 * The coax loop is conversational (JEWL's reasoning); these tools are the
 * mechanical ends of it: preview shows the caster their dice before they
 * commit, resolve rolls server-side via magic-cast-ops (mana deducted,
 * cast_result broadcast). The tool descriptions carry the validated casting
 * canon so JEWL prices intent correctly.
 */

import 'server-only';
import { z } from 'zod';
import { previewCast, executeCast } from '@/services/magic-cast-ops';
import { adjustMana } from '@/services/mana';
import { MAGIC_SCHOOLS, type MagicSchool } from '@/types/growth';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

const SCHOOLS_BY_PILLAR = (['mercy', 'balance', 'severity'] as const)
  .map((pillar) => {
    const schools = (Object.keys(MAGIC_SCHOOLS) as MagicSchool[])
      .filter((s) => MAGIC_SCHOOLS[s].pillar === pillar);
    return `${pillar}: ${schools.join(', ')}`;
  })
  .join('; ');

const CASTING_CANON =
  `Casting canon (validated): 10 schools across 3 pillars — ${SCHOOLS_BY_PILLAR}. ` +
  'WILD cast = improvised: Fate Die + school skill die vs DR; multi-school casts ' +
  'roll the WEAKEST involved school\'s die; a miss triggers an instant unavoidable ' +
  'Monkey Paw (GM/JEWL authors a twisted version of the intent) and makes the ' +
  'weakest school trainable. WOVEN spell = predefined: Fate Die + school die + an ' +
  'associated NON-magic skill die vs DR; a miss uses the spell\'s authored failure ' +
  'conditions — never a Monkey Paw. DR is ADDITIVE: base per effect, plus scaling ' +
  'for extra targets / size / duration / range, plus summed DRs of additional ' +
  'schools. Mana is optional: each point spent adds +1 to the roll, limited by the ' +
  'caster\'s current mana pool. DR at or above the system-engagement threshold ' +
  'flags godhead/Terminal review.';

const castInputSchema = z.object({
  casterCharacterId: z.string().min(1).describe('The casting character\'s id.'),
  schools: z
    .array(z.enum(Object.keys(MAGIC_SCHOOLS) as [MagicSchool, ...MagicSchool[]]))
    .min(1)
    .describe('Every school the effect draws on. Multi-school → weakest die governs.'),
  method: z
    .enum(['wild', 'woven'])
    .describe('wild = improvised intent; woven = casting a predefined spell.'),
  dr: z
    .number()
    .int()
    .min(1)
    .describe('The additive DR you assembled from the player\'s concrete ask.'),
  manaSpent: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Mana the caster commits (+1 to the roll per point).'),
  associatedSkillName: z
    .string()
    .min(1)
    .optional()
    .describe('Woven only (required): the associated non-magic skill.'),
  spellName: z
    .string()
    .min(1)
    .optional()
    .describe('Label for the log — the Woven spell\'s name or a short intent tag.'),
});

function toOpsInput(input: unknown) {
  const parsed = castInputSchema.parse(input);
  const { casterCharacterId, ...rest } = parsed;
  return { characterId: casterCharacterId, ...rest };
}

export const previewCastTool: JewlTool = {
  name: 'preview_cast',
  description:
    'Preview a cast WITHOUT rolling: shows which school die governs (weakest), ' +
    'the associated-skill die (woven), the caster\'s available mana, and whether ' +
    'the DR crosses the system-review threshold. Use this DURING the coax loop — ' +
    'when a player states vague magical intent, converse to pin down school(s), ' +
    'the concrete effect, an additive DR, mana commitment, and (woven) the ' +
    'associated skill; preview so the caster sees their odds BEFORE committing. ' +
    CASTING_CANON,
  inputSchema: castInputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const result = await previewCast(ctx.actorId, ctx.actorRole, toOpsInput(input));
    return { output: result };
  },
};

export const resolveCastTool: JewlTool = {
  name: 'resolve_cast',
  description:
    'ROLL and resolve a cast the caster has confirmed. Dice roll server-side; ' +
    'mana is deducted (pass the committed amount); the result broadcasts to the ' +
    'table. Only call after the caster confirms the previewed parameters. On a ' +
    'wild miss the output includes monkeyPaw:true — you then owe the table a ' +
    'twisted manifestation of the stated intent — and schoolToMarkTrainable ' +
    '(advancement wiring pending; announce it, the sheet does not store it yet). ' +
    CASTING_CANON,
  inputSchema: castInputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const result = await executeCast(ctx.actorId, ctx.actorRole, toOpsInput(input));
    return {
      output: {
        characterId: result.characterId,
        spellName: result.spellName,
        plan: {
          method: result.plan.method,
          schools: result.plan.schools,
          weakestSchool: result.plan.weakestSchool,
          schoolDie: result.plan.schoolDie,
          associatedDie: result.plan.associatedDie,
        },
        rolls: result.rolls,
        resolution: result.resolution,
        manaRemaining: result.manaRemaining,
      },
      affected: {
        characters: [
          {
            id: result.characterId,
            changes:
              result.plan.manaSpent > 0
                ? [`mana ${result.manaRemaining + result.plan.manaSpent} → ${result.manaRemaining}`]
                : [],
          },
        ],
      },
    };
  },
};

const adjustManaInputSchema = z.object({
  characterId: z.string().min(1).describe('The character whose mana pool changes.'),
  delta: z.number().int().describe('Change to CURRENT mana (negative to drain).'),
  maxDelta: z.number().int().optional()
    .describe('Optional change to MAX mana (capacity shifts from major narrative sources).'),
  note: z.string().max(500).optional()
    .describe('The narrative source — ley line, ritual, reagent, tapped residue, etc.'),
});

export const adjustManaTool: JewlTool = {
  name: 'adjust_mana',
  description:
    'Grant or drain a character\'s mana for a NARRATIVE reason. There is no ' +
    'automatic regen in GROWTH — mana comes from all over (ley lines, rituals, ' +
    'rest at sacred places, tapping lingering residue, GM rulings). Use when ' +
    'the fiction provides or costs mana. Current is clamped to [0, max]; pass ' +
    'maxDelta only when capacity itself changes.',
  inputSchema: adjustManaInputSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = adjustManaInputSchema.parse(input);
    const result = await adjustMana(ctx.actorId, ctx.actorRole, parsed);
    return {
      output: result,
      affected: {
        characters: [{ id: result.characterId, changes: [`mana → ${result.current}/${result.max}`] }],
      },
    };
  },
};

registerJewlTool(previewCastTool);
registerJewlTool(resolveCastTool);
registerJewlTool(adjustManaTool);
