import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { requireCampaignMember, requireCampaignGM } from '@/services/campaign-access';
import { startSession, endSession, listSessions, getActiveSession } from '@/services/campaign-event';
import { SceneNotReadyError } from '@/services/scene-readiness';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    await requireCampaignMember(campaignId, session.user);
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
    const auth = await requireAuth();
    const { id: campaignId } = await params;
    // Starting/ending a session runs the table — the campaign's GM or ADMIN only.
    await requireCampaignGM(campaignId, auth.user);
    const body = await request.json();
    const { action, name, crystallize } = body as { action: 'start' | 'end'; name?: string; crystallize?: boolean };

    if (action === 'start') {
      try {
        const session = await startSession(campaignId, name, { crystallize: crystallize === true, actor: { userId: auth.user.id, role: auth.user.role } });
        return NextResponse.json({ session }, { status: 201 });
      } catch (err) {
        // The scene is below the line: 409 with the list, so the Watcher can say "crystallize them and start".
        if (err instanceof SceneNotReadyError) {
          return NextResponse.json({ error: err.message, readiness: err.readiness }, { status: 409 });
        }
        throw err;
      }
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
