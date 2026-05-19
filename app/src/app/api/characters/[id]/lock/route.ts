import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { lockCharacter } from '@/services/character';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const updated = await lockCharacter(id, session.user.id);
    return NextResponse.json({
      character: { id: updated.id, name: updated.name, status: updated.status },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
