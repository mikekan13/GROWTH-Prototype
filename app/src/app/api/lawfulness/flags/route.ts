import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listFlags, listFlagsSchema } from '@/services/lawfulness';

export const dynamic = 'force-dynamic';

// GET /api/lawfulness/flags?campaignId=&status= — ADMIN: every flag; a Watcher:
// the flags at their own tables (no text, no pointer). Trailblazers get [].
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const q = listFlagsSchema.parse({
      campaignId: request.nextUrl.searchParams.get('campaignId') || undefined,
      status: request.nextUrl.searchParams.get('status') || undefined,
    });
    return NextResponse.json(await listFlags(q, { id: session.user.id, role: session.user.role }));
  } catch (error) {
    return errorResponse(error);
  }
}
