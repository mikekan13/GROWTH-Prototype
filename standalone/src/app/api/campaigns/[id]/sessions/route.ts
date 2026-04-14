import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { startSession, endSession, listSessions, getActiveSession } from '@/services/campaign-event';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const sessions = await listSessions(campaignId);
    const active = await getActiveSession(campaignId);
    return NextResponse.json({ sessions, active });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const { action, name } = body as { action: 'start' | 'end'; name?: string };

    if (action === 'start') {
      const session = await startSession(campaignId, name);
      return NextResponse.json({ session }, { status: 201 });
    }

    if (action === 'end') {
      const session = await endSession(campaignId);
      if (!session) {
        return NextResponse.json({ error: 'No active session to end' }, { status: 400 });
      }
      return NextResponse.json({ session });
    }

    return NextResponse.json({ error: 'action must be "start" or "end"' }, { status: 400 });
  } catch (error) {
    return errorResponse(error);
  }
}
