import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { setDayaStatus } from '@/daya/authoring';

export const dynamic = 'force-dynamic';

const enableBodySchema = z.object({
  status: z.enum(['ACTIVE', 'DORMANT']),
});

// POST /api/characters/[id]/daya/enable — the wake gate (spec §4):
// DayaEntity.status DORMANT<->ACTIVE. GM/ADMIN only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = enableBodySchema.parse(body);
    const result = await setDayaStatus(id, session.user.role, input.status);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
