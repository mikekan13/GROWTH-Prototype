import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { speakThroughNpc, narrateAtTable, getTableRoster } from '@/services/table-speak';

export const dynamic = 'force-dynamic';

const speakBodySchema = z.object({
  npcCharacterId: z.string().min(1),
  message: z.string().min(1).max(4000),
});

// The GM narrates the world: becomes canon, every awake being perceives it.
const narrateBodySchema = z.object({
  narrate: z.literal(true),
  message: z.string().min(1).max(4000),
  actorId: z.string().min(1).nullable().optional(),
  targetId: z.string().min(1).nullable().optional(),
  locationId: z.string().min(1).nullable().optional(),
});

const bodySchema = z.union([narrateBodySchema, speakBodySchema]);

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

// POST /api/campaigns/[id]/table
//   { npcCharacterId, message }  — speak one utterance through an NPC.
//   { narrate: true, message }   — narrate the world (canon + perception).
// Either way the line hits the shared event stream and every ACTIVE DAYA
// character at the table lives it; their responses post back.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = bodySchema.parse(body);
    const actor = { userId: session.user.id, username: session.user.username, role: session.user.role };
    const result = 'narrate' in input
      ? await narrateAtTable(campaignId, actor, input)
      : await speakThroughNpc(campaignId, actor, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
