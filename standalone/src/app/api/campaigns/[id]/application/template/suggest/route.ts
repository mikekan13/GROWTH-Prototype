import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { suggestPrompts } from '@/services/application';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const suggestions = await suggestPrompts(id, session.user.id, session.user.role);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return errorResponse(error);
  }
}
