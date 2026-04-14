import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getForgeItem, updateForgeItem, deleteForgeItem, updateForgeItemSchema } from '@/services/forge';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await requireAuth();
    const { itemId } = await params;
    const item = await getForgeItem(itemId, session.user.id, session.user.role);
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
    const { itemId } = await params;
    const body = await request.json();
    const input = updateForgeItemSchema.parse(body);
    const item = await updateForgeItem(itemId, session.user.id, session.user.role, input);
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
    await deleteForgeItem(itemId, session.user.id, session.user.role);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
