import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { setCanvasPosition, canvasPositionSchema } from '@/services/character';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = canvasPositionSchema.parse(body);
    const updated = await setCanvasPosition(id, session.user.id, session.user.role, input);
    return NextResponse.json({
      character: { id: updated.id, name: updated.name },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
