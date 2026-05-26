import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { enableAIForCharacter } from '@/services/godhead-admin';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const godhead = await enableAIForCharacter(id, session.user.id, session.user.role);
    return NextResponse.json({
      ok: true,
      godhead: { id: godhead.id, name: godhead.name },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
