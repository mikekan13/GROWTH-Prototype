/**
 * POST /api/campaigns/[id]/genesis/[sessionId]/redraft — the GM sends a
 * genesis's drafts back: every pending JEWL draft is withdrawn, JEWL is told
 * to generalise per the archetype law (blocks are campaign-agnostic), and the
 * session resumes. Campaign GM / ADMIN only. Thin wrapper over
 * services/genesis-redraft.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { withdrawDraftsAndRedraft } from '@/services/genesis-redraft';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, sessionId } = await params;
    const result = await withdrawDraftsAndRedraft({ campaignId: id, sessionId, actor: session.user });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
