/**
 * GET /api/campaigns/[id]/genesis/prods?characterId= — JEWL's prods for a
 * character's latest genesis session (genesis is a dialogue, 2026-10-12).
 * Campaign GM / ADMIN only. Thin wrapper over services/genesis-prods.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getCharacterProds } from '@/services/genesis-prods';

const querySchema = z.object({ characterId: z.string().min(1, 'characterId is required') });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const q = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const result = await getCharacterProds({ campaignId: id, characterId: q.characterId, user: session.user });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
