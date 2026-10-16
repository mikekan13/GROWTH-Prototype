import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { setLocationGeometry, footprintPatchSchema } from '@/services/placement-geometry';

export const dynamic = 'force-dynamic';

/** PATCH { footprint?: {points,scale,level,height?}, connects?: [{locationId, level}] } */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, locationId } = await params;
    const body = await request.json();
    const input = footprintPatchSchema.parse(body);
    const result = await setLocationGeometry(campaignId, locationId, session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
