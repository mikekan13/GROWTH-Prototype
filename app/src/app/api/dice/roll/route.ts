import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { DiceService } from '@/services/dice';
import type { DieType } from '@/types/dice';

export const dynamic = 'force-dynamic';

const RollSchema = z.object({
  dice: z.array(z.enum(['d4', 'd6', 'd8', 'd12', 'd20'])).min(1).max(10),
  context: z.string().optional(),
});

/**
 * POST /api/dice/roll — Quick die roll (one or more dice, no DR/effort)
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const body = await request.json();
    const { dice, context } = RollSchema.parse(body);

    const result = dice.length === 1
      ? DiceService.quickRoll(dice[0] as DieType, context)
      : DiceService.quickRollMultiple(dice as DieType[], context);

    return NextResponse.json({
      id: result.id,
      rolls: result.rolls.map(r => ({
        die: r.die,
        label: r.label,
        value: r.value,
        maxValue: r.maxValue,
      })),
      total: result.total,
      timestamp: result.timestamp,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
