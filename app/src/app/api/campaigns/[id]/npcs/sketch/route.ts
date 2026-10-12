/**
 * POST /api/campaigns/[id]/npcs/sketch — SKETCH genesis (2026-10-12).
 * The campaign's Watcher (or ADMIN) improvises an NPC mid-session; the sheet
 * + voice are built in the background. 202 + the characterId at once; poll
 * ./[characterId]/status or wait for the campaign stream's character_update.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { startSketch } from '@/services/sketch-genesis';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json().catch(() => ({}));
    const started = await startSketch(campaignId, { id: auth.user.id, role: auth.user.role, username: auth.user.username }, body);
    return NextResponse.json(started, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
