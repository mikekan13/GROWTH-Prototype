import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { detachEntity } from '@/services/entity-contents';
import { setTokenPosition, tokenPositionSchema } from '@/services/placement-geometry';

/** PATCH { position: {x, y} } — the thing's point inside its room (fractions 0..1 of the room box). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; edgeId: string }> },
) {
  try {
    const session = await requireAuth();
    const { id, edgeId } = await params;
    const body = tokenPositionSchema.parse(await request.json());
    const result = await setTokenPosition(id, edgeId, session.user.id, session.user.role, body.position);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; edgeId: string }> },
) {
  try {
    const session = await requireAuth();
    const { id, edgeId } = await params;
    await detachEntity(id, edgeId, session.user.id, session.user.role);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
