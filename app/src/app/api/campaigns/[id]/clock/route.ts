import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getClock, advanceClock, setClock, advanceClockSchema, setClockSchema } from '@/services/time';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;
    return NextResponse.json(await getClock(id));
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST { amount, unit, note? } advances; POST { set: { currentCycle, note? } } sets. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    if (body?.set) {
      const input = setClockSchema.parse(body.set);
      return NextResponse.json(await setClock(id, session.user.id, session.user.role, input));
    }
    const input = advanceClockSchema.parse(body);
    return NextResponse.json(await advanceClock(id, session.user.id, session.user.role, input));
  } catch (error) {
    return errorResponse(error);
  }
}
