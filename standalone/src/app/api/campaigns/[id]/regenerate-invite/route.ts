import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { regenerateInviteCode } from '@/services/campaign';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const result = await regenerateInviteCode(id, session.user.id, session.user.role);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
