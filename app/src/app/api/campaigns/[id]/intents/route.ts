import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listInspectIntents, postInspectIntent } from '@/services/inspection';

export const dynamic = 'force-dynamic';

// GET /api/campaigns/[id]/intents — open planning-board chips (perception unit 11: inspect intents only).
// The GM sees every chip; a member only their own characters'.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    return NextResponse.json({ intents: await listInspectIntents(id, session.user) });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/campaigns/[id]/intents — declare an inspection { characterId, subjectId | target, skillName? }.
// It rides the board and commits on the GM's next move. Owner of the character or the GM.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const intent = await postInspectIntent(id, session.user, await request.json());
    return NextResponse.json({ intent }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
