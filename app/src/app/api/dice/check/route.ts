import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { DiceService } from '@/services/dice';
import { computeTraitModifier } from '@/lib/trait-modifiers';
import type { FateDie, GrowthCharacter, GrowthTrait } from '@/types/growth';

export const dynamic = 'force-dynamic';

const CheckSchema = z.object({
  characterId: z.string(),
  skillName: z.string(),
  skillLevel: z.number().int().min(0).max(20),
  fateDie: z.enum(['d4', 'd6', 'd8', 'd12', 'd20']),
  effort: z.number().int().min(0).default(0),
  effortAttribute: z.string(),
  dr: z.number().int().min(1),
  flatModifiers: z.number().int().default(0),
  isSkilled: z.boolean(),
});

/**
 * POST /api/dice/check — Full skill/unskilled check via DiceService
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const params = CheckSchema.parse(body);

    // ── Trait modifiers — look up the character's nectars/thorns/blossoms
    //    and compute any "+N to <skill|attribute|pillar> checks" rules that
    //    apply to this check, then fold into flatModifiers.
    let traitModTotal = 0;
    let traitApplied: Array<{ amount: number; target: string; from: 'nectar' | 'blossom' | 'thorn' }> = [];
    try {
      const character = await prisma.character.findUnique({ where: { id: params.characterId } });
      if (character) {
        const data = JSON.parse(character.data) as Partial<GrowthCharacter>;
        const traits = (data.traits ?? []) as GrowthTrait[];
        const out = computeTraitModifier(traits, {
          skillName: params.skillName,
          effortAttribute: params.effortAttribute,
        });
        traitModTotal = out.total;
        traitApplied = out.applied;
      }
    } catch {
      // If the character lookup fails for any reason, fall through with no
      // trait modifier rather than failing the check.
    }

    const combinedFlat = params.flatModifiers + traitModTotal;

    const result = params.isSkilled
      ? DiceService.skilledCheck({
          characterId: params.characterId,
          skillName: params.skillName,
          skillLevel: params.skillLevel,
          fateDie: params.fateDie as FateDie,
          effort: params.effort,
          effortAttribute: params.effortAttribute,
          dr: params.dr,
          flatModifiers: combinedFlat,
        })
      : DiceService.unskilledCheck({
          characterId: params.characterId,
          fateDie: params.fateDie as FateDie,
          effort: params.effort,
          effortAttribute: params.effortAttribute,
          dr: params.dr,
          flatModifiers: combinedFlat,
        });

    return NextResponse.json({
      id: result.id,
      rolls: result.rolls.map(r => ({
        die: r.die,
        label: r.label,
        value: r.value,
        maxValue: r.maxValue,
      })),
      total: result.total,
      dr: result.dr,
      success: result.success,
      margin: result.margin,
      timestamp: result.timestamp,
      traitModifier: traitModTotal,
      traitApplied,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
