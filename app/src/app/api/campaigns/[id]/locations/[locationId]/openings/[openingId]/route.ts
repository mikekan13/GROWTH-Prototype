import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { setDoorState } from '@/services/place-map';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ state: z.enum(['open', 'closed', 'locked']) });

/** PATCH { state } — open / close / lock a door on a home's map (2026-10-17). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string; openingId: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, locationId, openingId } = await params;
    const { state } = bodySchema.parse(await request.json());
    const opening = await setDoorState(campaignId, { userId: session.user.id, role: session.user.role }, locationId, openingId, state);
    return NextResponse.json({ opening });
  } catch (error) {
    return errorResponse(error);
  }
}
