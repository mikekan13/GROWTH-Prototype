import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  grantSessionReward,
  listSessionRewards,
  grantSessionRewardSchema,
} from '@/services/session-reward';

export const dynamic = 'force-dynamic';

// POST /api/sessions/[id]/rewards — GM grants a KRMA reward
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = grantSessionRewardSchema.parse({ ...body, sessionId: id });
    const result = await grantSessionReward(session.user.id, session.user.role, input);
    return NextResponse.json({
      transactionId: result.transaction.id,
      amount: result.amount,
      characterId: result.characterId,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

// GET /api/sessions/[id]/rewards — list rewards granted in this session
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const rewards = await listSessionRewards(session.user.id, session.user.role, id);
    return NextResponse.json({ rewards });
  } catch (error) {
    return errorResponse(error);
  }
}
