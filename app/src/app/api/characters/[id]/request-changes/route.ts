import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { requestChanges, requestChangesSchema } from '@/services/character';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = requestChangesSchema.parse(body);
    const updated = await requestChanges(id, session.user.id, input);
    return NextResponse.json({
      character: { id: updated.id, name: updated.name, status: updated.status },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
