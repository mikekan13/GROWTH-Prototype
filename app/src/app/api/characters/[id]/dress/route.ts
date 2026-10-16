import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listWardrobe, setDressState } from '@/services/dress';

/**
 * DRESS (Mike, 16 Oct 2026): her wardrobe + kit, each worn / carried / owned.
 * GET  /api/characters/[id]/dress            → { wardrobe }
 * POST /api/characters/[id]/dress            { itemId, state: worn|carried|owned, region? } → { item }
 * Nothing is invented here — only her own things change state.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const wardrobe = await listWardrobe(id, session.user);
    return NextResponse.json({ wardrobe });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const item = await setDressState(id, await request.json(), session.user);
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}
