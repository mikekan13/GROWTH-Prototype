import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError } from '@/lib/errors';
import { injectionRegistry } from '@/services/dice-injection';
import type { DiceInjection, InjectionFilter, InjectionOverride } from '@/types/dice';

export const dynamic = 'force-dynamic';

/**
 * Verify the user is a Godhead (Terminal Admin).
 * For now, check role === 'admin'. This will be refined as the role system evolves.
 */
async function requireGodhead() {
  const session = await requireAuth();
  if (session.user.role !== 'admin') {
    throw new ForbiddenError('Dice injection requires Godhead access');
  }
  return session;
}

// ── GET — List active injections ──────────────────────────────────────────

export async function GET() {
  try {
    await requireGodhead();
    const injections = injectionRegistry.list();
    // Strip custom predicates (not serializable)
    const safe = injections.map(inj => ({
      id: inj.id,
      priority: inj.priority,
      filterType: inj.filter.type,
      overrideType: inj.override.type,
      oneShot: inj.oneShot,
      expiresAt: inj.expiresAt,
      reason: inj.reason,
      createdBy: inj.createdBy,
    }));
    return NextResponse.json({ injections: safe });
  } catch (error) {
    return errorResponse(error);
  }
}

// ── POST — Register an injection ──────────────────────────────────────────

const InjectSchema = z.object({
  filter: z.discriminatedUnion('type', [
    z.object({ type: z.literal('next_roll') }),
    z.object({ type: z.literal('character'), characterId: z.string() }),
    z.object({ type: z.literal('roll_source'), sourceType: z.string() }),
    z.object({ type: z.literal('skill'), skillName: z.string() }),
  ]),
  override: z.discriminatedUnion('type', [
    z.object({ type: z.literal('set_values'), values: z.array(z.number()) }),
    z.object({ type: z.literal('set_total'), total: z.number() }),
    z.object({ type: z.literal('ensure_success') }),
    z.object({ type: z.literal('ensure_failure') }),
    z.object({ type: z.literal('clamp_min'), min: z.number() }),
    z.object({ type: z.literal('clamp_max'), max: z.number() }),
    z.object({ type: z.literal('add_modifier'), bonus: z.number() }),
  ]),
  priority: z.number().int().default(10),
  oneShot: z.boolean().default(true),
  expiresAt: z.number().optional(),
  reason: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    await requireGodhead();
    const body = await request.json();
    const params = InjectSchema.parse(body);

    const id = `inj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    const injection: DiceInjection = {
      id,
      priority: params.priority,
      filter: params.filter as InjectionFilter,
      override: params.override as InjectionOverride,
      oneShot: params.oneShot,
      expiresAt: params.expiresAt,
      reason: params.reason,
      createdBy: 'godhead',
    };

    injectionRegistry.register(injection);

    return NextResponse.json({ id, registered: true });
  } catch (error) {
    return errorResponse(error);
  }
}

// ── DELETE — Remove an injection by ID (via query param) ──────────────────

export async function DELETE(request: NextRequest) {
  try {
    await requireGodhead();
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      // Clear all
      injectionRegistry.clear();
      return NextResponse.json({ cleared: true });
    }

    const removed = injectionRegistry.remove(id);
    return NextResponse.json({ id, removed });
  } catch (error) {
    return errorResponse(error);
  }
}
