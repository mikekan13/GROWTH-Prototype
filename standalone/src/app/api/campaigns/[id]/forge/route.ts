import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listForgeItems, createForgeItem, createForgeItemSchema } from '@/services/forge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const sp = request.nextUrl.searchParams;

    const items = await listForgeItems(campaignId, session.user.id, session.user.role, {
      type: sp.get('type') || undefined,
      status: sp.get('status') || undefined,
    });

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
    const input = createForgeItemSchema.parse(body);
    const item = await createForgeItem(campaignId, session.user.id, session.user.role, input);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
