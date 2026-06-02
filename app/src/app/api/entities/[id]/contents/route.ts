import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listEntityContents, attachEntityToParent } from '@/services/entity-contents';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const contents = await listEntityContents(id, session.user.id, session.user.role);
    return NextResponse.json({ contents });
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
    const edge = await attachEntityToParent(id, session.user.id, session.user.role, body);
    return NextResponse.json({ ok: true, edge: { id: edge.id, sourceId: edge.sourceId, sourceType: edge.sourceType } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
