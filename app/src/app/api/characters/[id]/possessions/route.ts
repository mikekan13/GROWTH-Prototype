import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listCharacterPossessions, createPossession } from '@/services/possession';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const possessions = await listCharacterPossessions(id, session.user.id, session.user.role);
    return NextResponse.json({ possessions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const edge = await createPossession(id, session.user.id, session.user.role, body);
    return NextResponse.json({ ok: true, possession: { id: edge.id, targetId: edge.targetId, targetType: edge.targetType } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
