import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { applyOutfit } from '@/services/dress';

/**
 * APPROVE OUTFIT: POST /api/characters/[id]/dress/apply { pieces } → { wardrobe }.
 * The player / GM approves — JEWL never does. Garments left out come off.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const wardrobe = await applyOutfit(id, await request.json(), session.user);
    return NextResponse.json({ wardrobe });
  } catch (error) {
    return errorResponse(error);
  }
}
