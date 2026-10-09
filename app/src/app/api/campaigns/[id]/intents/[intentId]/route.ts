import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { cancelInspectIntent, editInspectIntent } from '@/services/inspection';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; intentId: string }> };

// PATCH /api/campaigns/[id]/intents/[intentId] — { skillName?: string|null, dr?: number|null }.
// The GM names the skill and sets the DR; the character's owner may name (or clear) the skill.
export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth();
    const { id, intentId } = await params;
    const intent = await editInspectIntent(id, session.user, intentId, await request.json());
    return NextResponse.json({ intent });
  } catch (error) {
    return errorResponse(error);
  }
}

// DELETE — withdraw the intent before it commits (owner or GM).
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth();
    const { id, intentId } = await params;
    await cancelInspectIntent(id, session.user, intentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
