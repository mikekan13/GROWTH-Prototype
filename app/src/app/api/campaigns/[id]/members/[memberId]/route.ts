import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { reviewInterest } from '@/services/campaign';

// GM accepts or rejects an interested player
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const session = await requireAuth();
    const { memberId } = await params;
    const { action } = await request.json();

    if (!['BACKSTORY', 'REJECTED'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const result = await reviewInterest(session.user.id, session.user.role, memberId, action);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
