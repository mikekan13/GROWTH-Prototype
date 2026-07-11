import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  setCanvasPosition,
  removeCanvasPosition,
  canvasPositionSchema,
} from '@/services/character';

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

/**
 * Take the character off the canvas. The character itself is untouched
 * (status stays ACTIVE, all data preserved); only canvasX/canvasY are
 * stripped so the canvas filter excludes the card. Use POST to put it
 * back. The destructive "permanently delete character" action used to
 * live on the canvas right-click menu — we removed it because we should
 * not be able to delete a character from canvas-context.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const result = await removeCanvasPosition(id, session.user.id, session.user.role);
    return NextResponse.json({
      character: { id: result.character.id, name: result.character.name },
      wasOnCanvas: result.wasOnCanvas,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
