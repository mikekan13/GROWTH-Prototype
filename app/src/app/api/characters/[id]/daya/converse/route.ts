import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { converseWithEntity } from '@/daya/conversation';

export const dynamic = 'force-dynamic';

const converseBodySchema = z.object({
  message: z.string().min(1).max(4000),
});

// POST /api/characters/[id]/daya/converse — the 1:1 talk surface (spec §3).
// Mike's message enters as a stimulus; the response is her Say:/Do:/Attend:/
// Rest, or a graceful 'disabled'/'dormant'/'core_offline' status (spec §5)
// instead of a raw error. GM/ADMIN only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = converseBodySchema.parse(body);
    const result = await converseWithEntity(id, session.user.role, input.message);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
