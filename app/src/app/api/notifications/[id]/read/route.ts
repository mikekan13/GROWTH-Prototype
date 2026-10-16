/**
 * POST /api/notifications/[id]/read — mark one of the signed-in user's
 * notifications read. Thin wrapper over services/notifications.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { markNotificationRead } from '@/services/notifications';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const row = await markNotificationRead(session.user.id, id);
    return NextResponse.json({ id: row.id, readAt: row.readAt });
  } catch (error) {
    return errorResponse(error);
  }
}
