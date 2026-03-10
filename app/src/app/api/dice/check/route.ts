import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { DiceService } from '@/services/dice';
import type { FateDie } from '@/types/growth';

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

    const result = params.isSkilled
      ? DiceService.skilledCheck({
          characterId: params.characterId,
          skillName: params.skillName,
          skillLevel: params.skillLevel,
          fateDie: params.fateDie as FateDie,
          effort: params.effort,
          effortAttribute: params.effortAttribute,
          dr: params.dr,
          flatModifiers: params.flatModifiers,
        })
      : DiceService.unskilledCheck({
          characterId: params.characterId,
          fateDie: params.fateDie as FateDie,
          effort: params.effort,
          effortAttribute: params.effortAttribute,
          dr: params.dr,
          flatModifiers: params.flatModifiers,
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
    });
  } catch (error) {
    return errorResponse(error);
  }
}
