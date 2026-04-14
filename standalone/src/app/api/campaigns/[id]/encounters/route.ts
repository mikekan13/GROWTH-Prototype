import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listEncounters, createEncounter, createEncounterSchema } from '@/services/encounter';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const encounters = await listEncounters(campaignId);
    return NextResponse.json({ encounters });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = createEncounterSchema.parse(body);
    const encounter = await createEncounter(campaignId, session.user.id, session.user.role, input);
    return NextResponse.json({ encounter }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
