import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { reviewFlag, reviewFlagSchema } from '@/services/lawfulness';

export const dynamic = 'force-dynamic';

// POST /api/lawfulness/flags/[id]/review { status: REVIEWED|ACTIONED, note? }
// ADMIN or the campaign's Watcher may mark REVIEWED; only ADMIN may ACTION.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = reviewFlagSchema.parse(await request.json());
    return NextResponse.json({ flag: await reviewFlag(id, body, { id: session.user.id, role: session.user.role }) });
  } catch (error) {
    return errorResponse(error);
  }
}
