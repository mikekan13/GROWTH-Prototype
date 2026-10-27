import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCampaignAISettings, updateCampaignAISettings } from '@/ai/campaign-ai';
import { prisma } from '@/lib/db';
import { CLOUD_ONLY_FEATURES } from '@/ai/types';
import { z } from 'zod';

/** The one setting this route validates itself (thoughtStyle, 2026-10-26); the rest passes through as before. */
const thoughtStyleSchema = z.object({
  thoughtStyle: z.enum(['inner', 'narrator']).optional(),
  // Rolls as popup + card (2026-10-26): who sets Effort for the Watcher's beings, and how long a Trailblazer has.
  rollEffort: z.enum(['ai', 'manual']).optional(),
  rollTimeoutSec: z.number().int().min(10).max(600).optional(),
}).passthrough();

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

    const parsed = thoughtStyleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid AI settings' }, { status: 400 });
    }
    await updateCampaignAISettings(campaignId, parsed.data);
    const updated = await getCampaignAISettings(campaignId);

    return NextResponse.json({ settings: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
