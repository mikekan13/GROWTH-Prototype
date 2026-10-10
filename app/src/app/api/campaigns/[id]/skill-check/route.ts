/**
 * Skill Check Initiate — GM triggers a skill check against a player character.
 *
 * Flow:
 *   1. GM sends: characterId, skillName (or attributeName for unskilled), DR
 *   2. Server rolls SD (Skill Die)
 *   3. Server stores pending check
 *   4. Server broadcasts effort_wager_prompt to the target player via SSE
 *   5. Server broadcasts skill_check_request to everyone else
 *   6. Player responds via /api/campaigns/[id]/skill-check/wager
 *
 * Thin wrapper (2026-10-09): the logic lives in services/skill-check.ts
 * initiateSkillCheck, shared with committed inspect intents (perception unit 11).
 * Calling a check is one of the GM's "next moves" that commits the planning board.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { initiateSkillCheck, initiateSkillCheckSchema } from '@/services/skill-check';
import { commitPlanningBoardOnGmMove } from '@/services/inspection';
import { requireCampaignGM } from '@/services/campaign-access';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    // Security (2026-10-09): calling a check is the GM's move — only this campaign's GM (or ADMIN). Every
    // client caller is GM-side (canvas onSkillCheck isGM; terminal /skillcheck); a Trailblazer's own
    // inspection reaches initiateSkillCheck through the GM's planning-board commit, not this route.
    await requireCampaignGM(campaignId, session.user);
    const body = await request.json();
    const input = initiateSkillCheckSchema.parse(body);
    const result = await initiateSkillCheck(campaignId, { id: session.user.id, username: session.user.username }, input);
    commitPlanningBoardOnGmMove(campaignId, session.user);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
