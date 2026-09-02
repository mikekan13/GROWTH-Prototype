import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { speakThroughNpc, getTableRoster } from '@/services/table-speak';

export const dynamic = 'force-dynamic';

const speakBodySchema = z.object({
  npcCharacterId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

// GET /api/campaigns/[id]/table — roster for the TABLE tab: NPCs the GM can
// speak through + DAYA-active characters (warm-up targets). GM/ADMIN only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const roster = await getTableRoster(campaignId, session.user.role);
    return NextResponse.json(roster);
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/campaigns/[id]/table — speak one utterance through an NPC.
// Posts the line to the shared event stream and delivers it as a stimulus
// to every ACTIVE DAYA character at the table; their responses post back.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = speakBodySchema.parse(body);
    const result = await speakThroughNpc(
      campaignId,
      { userId: session.user.id, username: session.user.username, role: session.user.role },
      input,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
