/**
 * GET /api/characters/[id]/seed — the character's seed (who picked it) and
 * the campaign-visible catalog seeds (stock + campaign) for the Appearance
 * panel's picker. Campaign GM / ADMIN.
 *
 * PUT — GM override: { seedId } → writes the seed with seedPickedBy 'gm'.
 * Answers `rebuildWarning` when genesis already started (no auto-rebuild).
 *
 * Thin wrapper over services/seed-pick.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getSeedPanel, setSeedByGm } from '@/services/seed-pick';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    return NextResponse.json(await getSeedPanel(id, session.user));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await setSeedByGm(id, body, session.user));
  } catch (error) {
    return errorResponse(error);
  }
}
