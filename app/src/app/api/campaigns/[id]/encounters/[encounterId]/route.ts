import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getEncounter, setEncounterStatus, setParticipantDowned } from '@/services/encounter';

export const dynamic = 'force-dynamic';

const patchSchema = z.union([
  z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'RESOLVED']) }),
  // GM ruling on a Facing Death outcome: stand a participant back up (or put one down).
  z.object({ participantId: z.string().min(1), downed: z.boolean() }),
]);

// GET /api/campaigns/[id]/encounters/[encounterId] — encounter state (GM sees
// all; a member sees the shared record plus only their own intentions).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; encounterId: string }> }) {
  try {
    const session = await requireAuth();
    const { encounterId } = await params;
    const encounter = await getEncounter(encounterId, { userId: session.user.id, username: session.user.username, role: session.user.role });
    return NextResponse.json({ encounter });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH /api/campaigns/[id]/encounters/[encounterId] — flip status, or set a
// participant's downed flag (GM/ADMIN).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; encounterId: string }> }) {
  try {
    const session = await requireAuth();
    const { encounterId } = await params;
    const input = patchSchema.parse(await request.json());
    const actor = { userId: session.user.id, username: session.user.username, role: session.user.role };
    const encounter = 'status' in input
      ? await setEncounterStatus(encounterId, actor, input.status)
      : await setParticipantDowned(encounterId, actor, input.participantId, input.downed);
    return NextResponse.json({ encounter });
  } catch (error) {
    return errorResponse(error);
  }
}
