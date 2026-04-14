import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { pullFromGlobalCatalog } from '@/services/forge';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { globalItemId } = await request.json();
    const result = await pullFromGlobalCatalog(globalItemId, id, session.user.id, session.user.role);
    return NextResponse.json(result, { status: result.alreadyExists ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
