/**
 * POST /api/campaigns/[id]/ui-activity
 *
 * UI-activity breadcrumb ingest. JEWL is the OS layer of a campaign — he
 * watches the whole session, not just the chat. The client posts small
 * navigation/behavior breadcrumbs ("viewing canvas", "switched to the
 * persona surface — 3rd switch in a minute"); they land in the copilot
 * log as [ui] system rows (hidden from the visible chat) and feed the
 * same cheap classifier that gates ambient audio. When the trail shows
 * someone stuck or bouncing, the classifier can verdict `proact` and
 * JEWL reaches out first.
 *
 * Thin wrapper per architecture rules: parse → validate → write → classify.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { errorResponse } from '@/lib/api';
import { maybeFireClassifier } from '@/ai/copilot/classifier';

const MAX_TEXT_LEN = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;

    const body = (await request.json()) as { text?: string };
    const text = String(body.text ?? '').trim().slice(0, MAX_TEXT_LEN);
    if (!text) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }

    // Verify campaign access (GM of record or campaign member).
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    const isGM = campaign.gmUserId === session.user.id;
    if (!isGM) {
      const member = await prisma.campaignMember.findUnique({
        where: { campaignId_userId: { campaignId, userId: session.user.id } },
      });
      if (!member) {
        return NextResponse.json({ error: 'Not a campaign member' }, { status: 403 });
      }
    }

    await prisma.copilotMessage.create({
      data: {
        campaignId,
        role: 'user',
        content: `${session.user.username}: ${text}`,
        username: '[ui]',
        userId: session.user.id,
        actions: JSON.stringify({ source: 'UI_ACTIVITY' }),
      },
    });

    // Same gate as ambient audio: a cheap classifier decides whether this
    // moment warrants waking JEWL. Verdict is awaited (fast) so the client
    // can flip a "thinking" indicator; the actual reply lands via polling.
    let classifierVerdict: string | undefined;
    try {
      const result = await maybeFireClassifier({
        campaignId,
        actorId: session.user.id,
        actorName: session.user.username,
        actorRole: session.user.role,
      });
      classifierVerdict = result?.verdict;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ui-activity] classifier failed:', err);
    }

    return NextResponse.json({ accepted: true, classifierVerdict });
  } catch (error) {
    return errorResponse(error);
  }
}
