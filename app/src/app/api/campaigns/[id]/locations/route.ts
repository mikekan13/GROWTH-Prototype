import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listLocations, createLocation, createLocationSchema } from '@/services/location';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const locations = await listLocations(campaignId);
    return NextResponse.json({ locations });
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
    const input = createLocationSchema.parse(body);
    const location = await createLocation(campaignId, session.user.id, session.user.role, input);
    return NextResponse.json({ location }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
