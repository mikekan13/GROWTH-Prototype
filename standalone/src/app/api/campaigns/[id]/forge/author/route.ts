import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  authorForgeItem,
  confirmForgeAuthoring,
  forgeAuthorInputSchema,
} from '@/services/forge-authoring';

/**
 * POST /api/campaigns/[id]/forge/author
 * Step 1: GM describes what they want → Kai generates mechanical stats
 * Returns the AI-generated result for GM review (not persisted yet)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = forgeAuthorInputSchema.parse(body);
    const result = await authorForgeItem(campaignId, session.user.id, session.user.role, input);
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/campaigns/[id]/forge/author
 * Step 2: GM reviews and confirms → persist the forge item
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();

    const { type, name, data, karmicValue } = body;
    if (!type || !name || !data) {
      return NextResponse.json({ error: 'Missing type, name, or data' }, { status: 400 });
    }

    const item = await confirmForgeAuthoring(campaignId, session.user.id, session.user.role, {
      type,
      name,
      data,
      karmicValue,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
