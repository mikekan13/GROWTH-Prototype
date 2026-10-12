/**
 * GET /api/campaigns/[id]/jewl/work — JEWL's work screen payload (2026-10-12):
 * every open work session (type, stages, pillar counters, needs-you items,
 * recent log), the campaign's Needs-you list and JEWL's recent log. Campaign
 * GM / ADMIN only. Thin wrapper over services/jewl-work.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getJewlWork } from '@/services/jewl-work';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await getJewlWork({ campaignId: id, user: session.user }));
  } catch (error) {
    return errorResponse(error);
  }
}
