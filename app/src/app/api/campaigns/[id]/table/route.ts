import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { speakProse, speakThroughNpc, narrateAtTable, getTableRoster } from '@/services/table-speak';

export const dynamic = 'force-dynamic';

// The GM types prose; narration and quoted speech are picked up from it.
const proseBodySchema = z.object({
  message: z.string().min(1).max(6000),
  locationId: z.string().min(1).nullable().optional(),
});

// Pre-09-26 shapes, still honored for scripts/tests.
const speakBodySchema = z.object({
  npcCharacterId: z.string().min(1),
  message: z.string().min(1).max(4000),
});
const narrateBodySchema = z.object({
  narrate: z.literal(true),
  message: z.string().min(1).max(4000),
  actorId: z.string().min(1).nullable().optional(),
  targetId: z.string().min(1).nullable().optional(),
  locationId: z.string().min(1).nullable().optional(),
});

const bodySchema = z.union([narrateBodySchema, speakBodySchema, proseBodySchema]);

// GET /api/campaigns/[id]/table — roster for the TABLE tab: NPCs + DAYA-active
// characters (warm-up targets). GM/ADMIN only.
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
//   { message }                  — prose: narration + quoted speech, picked up as written.
//   { npcCharacterId, message }  — speak one utterance through an NPC (legacy shape).
//   { narrate: true, message }   — narrate only (legacy shape; prose covers it).
// Every ACTIVE DAYA character at the table lives it through the mirror; their
// responses post back.
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
      : 'npcCharacterId' in input
        ? await speakThroughNpc(campaignId, actor, input)
        : await speakProse(campaignId, actor, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
