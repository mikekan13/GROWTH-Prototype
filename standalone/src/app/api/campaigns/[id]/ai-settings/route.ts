import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCampaignAISettings, updateCampaignAISettings } from '@/ai/campaign-ai';
import { prisma } from '@/lib/db';
import { CLOUD_ONLY_FEATURES } from '@/ai/types';

/**
 * GET /api/campaigns/[id]/ai-settings
 * Get AI settings for a campaign.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const settings = await getCampaignAISettings(campaignId);
    return NextResponse.json({ settings, cloudOnlyFeatures: CLOUD_ONLY_FEATURES });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/campaigns/[id]/ai-settings
 * Update AI settings (GM only).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;

    // Verify GM
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { gmUserId: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    if (campaign.gmUserId !== session.user.id && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only the GM can change AI settings' }, { status: 403 });
    }

    const body = await request.json();
    await updateCampaignAISettings(campaignId, body);
    const updated = await getCampaignAISettings(campaignId);

    return NextResponse.json({ settings: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
