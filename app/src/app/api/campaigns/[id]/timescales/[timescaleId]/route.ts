import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { updateTimescale, deleteTimescale, setDefaultTimescale, updateTimescaleSchema } from '@/services/time';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; timescaleId: string }> },
) {
  try {
    const session = await requireAuth();
    const { id, timescaleId } = await params;
    const body = await request.json();
    // `{ makeDefault: true }` promotes without other edits.
    if (body?.makeDefault === true) {
      const ts = await setDefaultTimescale(id, session.user.id, session.user.role, timescaleId);
      return NextResponse.json({ timescale: ts, default: true });
    }
    const input = updateTimescaleSchema.parse(body);
    const updated = await updateTimescale(id, session.user.id, session.user.role, timescaleId, input);
    return NextResponse.json({ timescale: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; timescaleId: string }> },
) {
  try {
    const session = await requireAuth();
    const { id, timescaleId } = await params;
    return NextResponse.json(await deleteTimescale(id, session.user.id, session.user.role, timescaleId));
  } catch (error) {
    return errorResponse(error);
  }
}
