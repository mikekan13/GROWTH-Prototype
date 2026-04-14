import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { loadDraftEntity, saveDraftStep } from '@/services/entity';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  try {
    const session = await requireAuth();
    const { entityId } = await params;
    const draft = await loadDraftEntity(entityId, session.user.id, session.user.role);
    return NextResponse.json(draft);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  try {
    const session = await requireAuth();
    const { entityId } = await params;
    const body = await request.json();
    await saveDraftStep(entityId, session.user.id, session.user.role, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
