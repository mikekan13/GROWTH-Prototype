/**
 * Magic Cast Ops — db/rolling wrapper around the pure cast engine
 * (services/magic-cast.ts). Loads the character, checks permissions, reads
 * the ADMIN-tunable magicCasting config, rolls via lib/dice (crypto RNG,
 * server-side — dice are never client-supplied), resolves, deducts mana,
 * saves, broadcasts. Mirrors advancement-ops.ts.
 *
 * Deliberate non-inferences (canon SILENT, flagged in NEEDS-MIKE):
 *  - Mana is consumed whether the cast succeeds or fails (no refund rule
 *    exists; Mana_System.md never distinguishes).
 *  - DR >= systemEngagementDR FLAGS review, does not block resolution —
 *    matches the signed-off schema's requiresSystemReview boolean
 *    (r-2026-07-23-01). If Mike rules "block", gate before the roll here.
 *  - The wild-fail trainable mark is REPORTED (schoolToMarkTrainable), not
 *    persisted — trainable-schools storage structure awaits Mike's call
 *    (r-2026-07-15-01 magic wiring).
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { broadcastEvent } from '@/lib/campaign-stream';
import { rollDie, rollFateDie } from '@/lib/dice';
import { getMagicCastingConfig } from './economy-config';
import {
  computeCastPlan,
  resolveCast,
  CastError,
  type CastPlan,
  type CastResolution,
  type CastRolls,
} from './magic-cast';
import type { GrowthCharacter, MagicSchool } from '@/types/growth';
import { MAGIC_SCHOOLS } from '@/types/growth';

const magicSchool = z.custom<MagicSchool>(
  (s): s is MagicSchool => typeof s === 'string' && s in MAGIC_SCHOOLS,
  { message: 'Unknown magic school' },
);

export const castRequestSchema = z.object({
  characterId: z.string().min(1),
  schools: z.array(magicSchool).min(1),
  method: z.enum(['wild', 'woven']),
  dr: z.number().int().min(1),
  manaSpent: z.number().int().min(0).optional(),
  associatedSkillName: z.string().min(1).optional(),
  /** Optional label (e.g. the Woven spell's name) for the broadcast/log. */
  spellName: z.string().min(1).optional(),
});

export type CastOpRequest = z.infer<typeof castRequestSchema>;

export interface CastOpResult {
  characterId: string;
  plan: CastPlan;
  rolls: CastRolls;
  resolution: CastResolution;
  manaRemaining: number;
  spellName?: string;
}

export interface CastPreviewResult {
  characterId: string;
  plan: CastPlan;
  manaAvailable: number;
  systemEngagementDR: number;
}

/**
 * Compute the cast plan WITHOUT rolling or mutating — what JEWL shows the
 * caster while coaxing params from vague intent (r-2026-07-22-01). Same
 * permission gate as executeCast so a preview can't probe other sheets.
 */
export async function previewCast(
  userId: string,
  userRole: string,
  input: CastOpRequest,
): Promise<CastPreviewResult> {
  const validated = castRequestSchema.parse(input);

  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Cannot cast for this character');
  }

  const charData = JSON.parse(character.data) as GrowthCharacter;
  const config = await getMagicCastingConfig();

  let plan: CastPlan;
  try {
    plan = computeCastPlan(charData, validated, config.systemEngagementDR);
  } catch (err) {
    if (err instanceof CastError) throw new ValidationError(err.message);
    throw err;
  }

  return {
    characterId: character.id,
    plan,
    manaAvailable: charData.magic?.mana?.current ?? 0,
    systemEngagementDR: config.systemEngagementDR,
  };
}

export async function executeCast(
  userId: string,
  userRole: string,
  input: CastOpRequest,
): Promise<CastOpResult> {
  const validated = castRequestSchema.parse(input);

  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Cannot cast for this character');
  }

  const charData = JSON.parse(character.data) as GrowthCharacter;
  const config = await getMagicCastingConfig();

  let plan: CastPlan;
  try {
    plan = computeCastPlan(charData, validated, config.systemEngagementDR);
  } catch (err) {
    if (err instanceof CastError) throw new ValidationError(err.message);
    throw err;
  }

  const manaCurrent = charData.magic?.mana?.current ?? 0;
  if (plan.manaSpent > manaCurrent) {
    throw new ValidationError(
      `Not enough mana: ${plan.manaSpent} committed, ${manaCurrent} available`,
    );
  }

  // Fate die rides the seed (same fallback as character-actions/terminal-commands).
  const fateDie = charData.creation?.seed?.baseFateDie || 'd6';
  const rolls: CastRolls = {
    fateDieResult: rollFateDie(fateDie).value,
  };
  if (plan.schoolDieSides > 0) {
    rolls.schoolDieResult = rollDie(plan.schoolDieSides);
  }
  if (plan.method === 'woven' && (plan.associatedDieSides ?? 0) > 0) {
    rolls.associatedDieResult = rollDie(plan.associatedDieSides!);
  }

  const resolution = resolveCast(plan, rolls);

  let manaRemaining = manaCurrent;
  if (plan.manaSpent > 0 && charData.magic?.mana) {
    charData.magic.mana.current = manaCurrent - plan.manaSpent;
    manaRemaining = charData.magic.mana.current;
    await prisma.character.update({
      where: { id: validated.characterId },
      data: { data: JSON.stringify(charData) },
    });
  }

  if (character.campaignId) {
    if (plan.manaSpent > 0) {
      broadcastEvent(character.campaignId, {
        kind: 'character_update',
        characterId: character.id,
        characterName: character.name,
        fields: ['magic'],
      });
    }
    broadcastEvent(character.campaignId, {
      kind: 'cast_result',
      characterId: character.id,
      characterName: character.name,
      method: plan.method,
      spellName: validated.spellName,
      schools: plan.schools,
      weakestSchool: plan.weakestSchool,
      fateRoll: resolution.fate,
      schoolContribution: resolution.school,
      associatedContribution: resolution.associated,
      manaSpent: resolution.manaBonus,
      total: resolution.total,
      dr: resolution.dr,
      margin: resolution.margin,
      success: resolution.success,
      monkeyPaw: resolution.monkeyPaw,
      schoolToMarkTrainable: resolution.schoolToMarkTrainable,
      requiresSystemReview: resolution.requiresSystemReview,
    });
  }

  return {
    characterId: character.id,
    plan,
    rolls,
    resolution,
    manaRemaining,
    spellName: validated.spellName,
  };
}
