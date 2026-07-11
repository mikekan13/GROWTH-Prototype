import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  equipItem,
  equipItemSchema,
  unequipItem,
  unequipItemSchema,
} from '@/services/inventory';

/** Equip an item the character holds to a derived body region. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const input = equipItemSchema.parse(await request.json());
    const item = await equipItem(id, input, session.user.id, session.user.role);
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Unequip an item back to the carried tier. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const input = unequipItemSchema.parse(await request.json());
    const item = await unequipItem(id, input, session.user.id, session.user.role);
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}
