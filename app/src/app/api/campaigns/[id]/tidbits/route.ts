import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ValidationError } from '@/lib/errors';
import { getTidbits, tidbitsQuerySchema } from '@/services/tidbits';

export const dynamic = 'force-dynamic';

// GET /api/campaigns/[id]/tidbits?viewer=<characterId|watcher> — ~12 short lines for the session-start ticker,
// drawn from the campaign's data for whoever is watching (Watcher = the whole campaign; a character = only what
// that character knows). Thin: parse → service (which checks who may look through whose eyes).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const parsed = tidbitsQuerySchema.safeParse({ viewer: request.nextUrl.searchParams.get('viewer') ?? '' });
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? 'viewer is required');
    const result = await getTidbits({ id: session.user.id, role: session.user.role }, campaignId, parsed.data);
    return NextResponse.json(result, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  } catch (error) {
    return errorResponse(error);
  }
}
