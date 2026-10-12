/**
 * POST /api/campaigns/[id]/genesis/drafts/[draftId]/feedback { note } — the GM
 * sends ONE of JEWL's genesis drafts back with a note (≤600): that draft is
 * withdrawn, the note reaches JEWL's next cycle verbatim, and the genesis
 * resumes to redraft it. Seeds too. Campaign GM / ADMIN only. Thin wrapper
 * over services/genesis-redraft#requestDraftRevision.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { requestDraftRevision } from '@/services/genesis-redraft';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; draftId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, draftId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await requestDraftRevision({ campaignId: id, draftId, body, actor: session.user });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
