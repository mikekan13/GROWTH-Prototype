import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { publishForgeItem, unpublishForgeItem } from '@/services/forge';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    const { itemId } = await params;
    const item = await publishForgeItem(itemId, session.user.id, session.user.role);
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
