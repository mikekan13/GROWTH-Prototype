import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getEncounter, setEncounterStatus } from '@/services/encounter';

export const dynamic = 'force-dynamic';

const statusSchema = z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'RESOLVED']) });

// GET /api/campaigns/[id]/encounters/[encounterId] — full encounter state.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; encounterId: string }> }) {
  try {
    await requireAuth();
    const { encounterId } = await params;
    return NextResponse.json({ encounter: await getEncounter(encounterId) });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/campaigns/[id]/encounters/[encounterId] — flip status (GM/ADMIN).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; encounterId: string }> }) {
  try {
    const session = await requireAuth();
    const { encounterId } = await params;
    const { status } = statusSchema.parse(await request.json());
    const encounter = await setEncounterStatus(
      encounterId,
      { userId: session.user.id, username: session.user.username, role: session.user.role },
      status,
    );
    return NextResponse.json({ encounter });
  } catch (error) {
    return errorResponse(error);
  }
}
