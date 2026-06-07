import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { setLocationParent } from '@/services/location';

export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  parentId: z.string().nullable(),
});

/**
 * Set or clear a Location's parent (located_at edge). Used by the canvas's
 * drag-folder-into-folder gesture. parentId = null detaches the Location.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId, locationId } = await params;
    const body = await request.json();
    const { parentId } = inputSchema.parse(body);
    const result = await setLocationParent(
      campaignId,
      session.user.id,
      session.user.role,
      locationId,
      parentId,
    );
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
