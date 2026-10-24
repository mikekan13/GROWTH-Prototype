import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  listCampaignItems, createCampaignItem, createCampaignItemSchema, listCampaignItemsQuerySchema,
} from '@/services/campaign-item';

export const dynamic = 'force-dynamic';

/** GET ?holderId=&locationId= — optional filters; no params = every item (unchanged). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const filter = listCampaignItemsQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const items = await listCampaignItems(campaignId, filter);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = createCampaignItemSchema.parse(body);
    const item = await createCampaignItem(campaignId, session.user.id, session.user.role, input);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
