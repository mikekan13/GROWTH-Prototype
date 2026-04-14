import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  updatePlayerRequest,
  resolvePlayerRequest,
  updatePlayerRequestSchema,
  resolvePlayerRequestSchema,
} from '@/services/forge';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  try {
    const session = await requireAuth();
    const { requestId } = await params;
    const body = await request.json();

    // If body has 'status', this is a GM resolution; otherwise it's a player edit
    if (body.status) {
      const input = resolvePlayerRequestSchema.parse(body);
      const result = await resolvePlayerRequest(requestId, session.user.id, session.user.role, input);
      return NextResponse.json({ request: result });
    } else {
      const input = updatePlayerRequestSchema.parse(body);
      const result = await updatePlayerRequest(requestId, session.user.id, input);
      return NextResponse.json({ request: result });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
