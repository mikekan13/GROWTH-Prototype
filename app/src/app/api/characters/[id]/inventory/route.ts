import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listInventory } from '@/services/inventory';

/** GET the 3-tier inventory: derived regions, equipped, carried, possessions, encumbrance. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const inventory = await listInventory(id, session.user.id, session.user.role);
    return NextResponse.json({ inventory });
  } catch (error) {
    return errorResponse(error);
  }
}
