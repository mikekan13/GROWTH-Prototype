import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  getDeathSaveState,
  rollDeathSave,
  rollDeathSaveSchema,
  sparePendingDeath,
} from '@/services/death-save';

/** GET the character's death-door state (triggers, fate die, pending split). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const state = await getDeathSaveState(id, session.user.id, session.user.role);
    return NextResponse.json({ state });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Resolve a death save. GM enacts Tara's choice (incl. NO_REAP). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const input = rollDeathSaveSchema.parse(await request.json());
    const outcome = await rollDeathSave(id, input, session.user.id, session.user.role);
    return NextResponse.json({ outcome });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Tara's mercy (r-2026-07-11-02): spare a FAILED save — clears the pending split. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await sparePendingDeath(id, session.user.id, session.user.role);
    return NextResponse.json({ spared: true });
  } catch (error) {
    return errorResponse(error);
  }
}
