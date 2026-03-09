import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCampaignItem, updateCampaignItem, deleteCampaignItem, updateCampaignItemSchema } from '@/services/campaign-item';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId, itemId } = await params;
    const item = await getCampaignItem(itemId, campaignId);
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, itemId } = await params;
    const body = await request.json();
    const input = updateCampaignItemSchema.parse(body);
    const item = await updateCampaignItem(itemId, campaignId, session.user.id, session.user.role, input);
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, itemId } = await params;
    await deleteCampaignItem(itemId, campaignId, session.user.id, session.user.role);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
