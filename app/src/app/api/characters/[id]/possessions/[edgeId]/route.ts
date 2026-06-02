import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { deletePossession } from '@/services/possession';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; edgeId: string }> },
) {
  try {
    const session = await requireAuth();
    const { id, edgeId } = await params;
    await deletePossession(id, edgeId, session.user.id, session.user.role);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
