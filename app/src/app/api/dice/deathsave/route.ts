import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { DiceService } from '@/services/dice';
import type { FateDie } from '@/types/growth';

export const dynamic = 'force-dynamic';

const DeathSaveSchema = z.object({
  characterId: z.string(),
  fateDie: z.enum(['d4', 'd6', 'd8', 'd12', 'd20']),
  healthLevel: z.number().int().min(0),
  dr: z.number().int().min(1).default(10),
});

/**
 * POST /api/dice/deathsave — Death save roll (FD + Health Level vs DR)
 * Server-side only. Result is authoritative.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const params = DeathSaveSchema.parse(body);

    const result = DiceService.deathSave({
      characterId: params.characterId,
      fateDie: params.fateDie as FateDie,
      healthLevel: params.healthLevel,
      ladyDeathDr: params.dr,
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
      metadata: { healthLevel: params.healthLevel },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
