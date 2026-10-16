import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { proposeOutfit } from '@/services/dress';

/**
 * LET JEWL DRESS HER: POST /api/characters/[id]/dress/propose → { proposal }.
 * One local-lane call; a proposal from HER OWN things only; nothing is
 * written until the table approves (…/dress/apply).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const proposal = await proposeOutfit(id, session.user);
    return NextResponse.json({ proposal });
  } catch (error) {
    return errorResponse(error);
  }
}
