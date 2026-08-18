import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { publishForgeItem, unpublishForgeItem } from '@/services/forge';
import { maybeNotifyJewlForgeBatchResolved } from '@/ai/copilot/forge-batch-watch';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    const { itemId } = await params;
    const item = await publishForgeItem(itemId, session.user.id, session.user.role);
    // Forge watch (fire-and-forget): if this was JEWL's last pending
    // draft in the campaign, he follows up on the whole batch. Keyed to the
    // item's OWN campaign — the URL id could disagree (bug hunt L12).
    if (item.campaignId) {
      void maybeNotifyJewlForgeBatchResolved(
        item.campaignId,
        { name: item.name, createdBy: item.createdBy },
        'published',
      );
    }
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    const { itemId } = await params;
    const item = await unpublishForgeItem(itemId, session.user.id, session.user.role);
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}
