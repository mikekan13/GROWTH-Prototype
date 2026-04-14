import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getEncounter, updateEncounter, deleteEncounter, updateEncounterSchema } from '@/services/encounter';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; encounterId: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId, encounterId } = await params;
    const encounter = await getEncounter(encounterId, campaignId);
    return NextResponse.json({ encounter });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; encounterId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, encounterId } = await params;
    const body = await request.json();
    const input = updateEncounterSchema.parse(body);
    const encounter = await updateEncounter(encounterId, campaignId, session.user.id, session.user.role, input);
    return NextResponse.json({ encounter });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; encounterId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, encounterId } = await params;
    await deleteEncounter(encounterId, campaignId, session.user.id, session.user.role);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
