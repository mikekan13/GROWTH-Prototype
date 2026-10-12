/** GET /api/campaigns/[id]/npcs/sketch/[characterId]/status — PENDING | DONE | FAILED (Watcher/ADMIN). */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getSketchStatus } from '@/services/sketch-genesis';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; characterId: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id: campaignId, characterId } = await params;
    const status = await getSketchStatus(campaignId, { id: auth.user.id, role: auth.user.role }, characterId);
    return NextResponse.json(status);
  } catch (error) {
    return errorResponse(error);
  }
}
