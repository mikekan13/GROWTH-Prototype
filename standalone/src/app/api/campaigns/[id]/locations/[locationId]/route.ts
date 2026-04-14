import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getLocation, updateLocation, deleteLocation, updateLocationSchema } from '@/services/location';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId, locationId } = await params;
    const location = await getLocation(locationId, campaignId);
    return NextResponse.json({ location });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, locationId } = await params;
    const body = await request.json();
    const input = updateLocationSchema.parse(body);
    const location = await updateLocation(locationId, campaignId, session.user.id, session.user.role, input);
    return NextResponse.json({ location });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, locationId } = await params;
    await deleteLocation(locationId, campaignId, session.user.id, session.user.role);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
