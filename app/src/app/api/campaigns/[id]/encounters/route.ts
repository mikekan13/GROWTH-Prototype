import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { createEncounter, createEncounterSchema, listEncounters } from '@/services/encounter';

export const dynamic = 'force-dynamic';

// GET /api/campaigns/[id]/encounters — list this campaign's encounters.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    return NextResponse.json({ encounters: await listEncounters(campaignId) });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/campaigns/[id]/encounters — create a PLANNED encounter (GM/ADMIN).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const input = createEncounterSchema.parse(await request.json());
    const encounter = await createEncounter(
      campaignId,
      { userId: session.user.id, username: session.user.username, role: session.user.role },
      input,
    );
    return NextResponse.json({ encounter });
  } catch (error) {
    return errorResponse(error);
  }
}
