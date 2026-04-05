import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { createGoal, listGoals, listCampaignGoals, createGoalSchema } from '@/services/goal';

// GET /api/goals?characterId=...&status=... OR ?campaignId=...
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const { searchParams } = request.nextUrl;
    const characterId = searchParams.get('characterId');
    const campaignId = searchParams.get('campaignId');
    const status = searchParams.get('status') || undefined;

    if (campaignId) {
      const goals = await listCampaignGoals(campaignId, session.user.id, session.user.role);
      return NextResponse.json({ goals });
    }

    if (!characterId) {
      return NextResponse.json({ error: 'characterId or campaignId required' }, { status: 400 });
    }

    const goals = await listGoals(characterId, session.user.id, session.user.role, status);
    return NextResponse.json({ goals });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/goals — create a new goal
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await request.json();
    const input = createGoalSchema.parse(body);
    const goal = await createGoal(session.user.id, session.user.role, input);
    return NextResponse.json({ goal }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
