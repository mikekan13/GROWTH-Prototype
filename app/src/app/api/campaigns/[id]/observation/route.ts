/**
 * JEWL observation endpoint — the async witness path.
 *
 * Direct GM canvas mutations (damage panel, slider, picker, drag, etc.)
 * commit IMMEDIATELY through their own service endpoints. AFTER the mutation
 * lands, the UI fires a POST here describing what happened. This route wraps
 * the description as a `JewlPrompt` with source=GM_CANVAS_ACTION, fires
 * `dispatchPrompt` without awaiting, and returns 202.
 *
 * JEWL processes the observation in the background and writes his reaction
 * (silent / acknowledge / challenge) to the CopilotMessage log. The chip
 * surfaces it on next open. The UI never waits on JEWL.
 *
 * See [[jewl-is-the-interface-2026-06-15]] (the corrected direct-mutation
 * shape) and [[jewl-full-vision-2026-06-14]] (source-pluggable runtime).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { dispatchPrompt } from '@/ai/copilot/runtime';
import { prisma } from '@/lib/db';
import type { JewlPrompt, CanvasActionPayload } from '@/ai/copilot/prompts/types';

interface ObservationBody {
  /** Short kebab verb identifying the mutation kind: 'damage', 'edit-location', 'advance-time'. */
  mutationKind?: string;
  /** What was mutated. */
  targetType?: CanvasActionPayload['targetType'];
  targetId?: string;
  /** One-line natural-language summary of what just happened. */
  summary?: string;
  /** Optional GM note explaining the reason. Threaded into JEWL's view of the event. */
  note?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const body = (await request.json()) as ObservationBody;

    const mutationKind = String(body.mutationKind ?? '').trim();
    const targetType = body.targetType;
    const targetId = String(body.targetId ?? '').trim();
    const summary = String(body.summary ?? '').trim();
    const note = body.note ? String(body.note).trim() : undefined;

    if (!mutationKind || !targetType || !targetId || !summary) {
      return NextResponse.json(
        { error: 'mutationKind, targetType, targetId, and summary are required' },
        { status: 400 },
      );
    }
    if (summary.length > 1000) {
      return NextResponse.json({ error: 'summary too long (max 1000)' }, { status: 400 });
    }
    if (note && note.length > 1000) {
      return NextResponse.json({ error: 'note too long (max 1000)' }, { status: 400 });
    }

    // Verify access: GM or campaign member.
    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }
    const isGM = campaign.gmUserId === session.user.id;
    if (!isGM) {
      const member = await prisma.campaignMember.findUnique({
        where: { campaignId_userId: { campaignId: id, userId: session.user.id } },
      });
      if (!member) {
        return NextResponse.json({ error: 'Not a campaign member' }, { status: 403 });
      }
    }

    // Compose the prompt JEWL receives. The intent line + optional note carries
    // everything he needs to reason about the event. No tool is proposed — the
    // mutation already happened; JEWL is the witness, not the executor.
    const intent = note ? `${summary}\n\nGM note: ${note}` : summary;
    const canvasAction: CanvasActionPayload = {
      kind: mutationKind,
      targetType,
      targetId,
      intent,
    };

    const prompt: JewlPrompt = {
      source: 'GM_CANVAS_ACTION',
      campaignId: id,
      actorId: session.user.id,
      actorName: session.user.username,
      actorRole: session.user.role,
      text: '',
      canvasAction,
    };

    // Fire-and-forget. JEWL writes his reaction to the CopilotMessage log
    // asynchronously; the chip picks it up on next open. The UI never waits.
    // (In dev / a long-running Node server this runs after the response is
    //  sent; in serverless we'd swap this for a queued job — fine for now.)
    void dispatchPrompt(prompt).catch(err => {
      // eslint-disable-next-line no-console
      console.error('[JEWL observation] dispatchPrompt failed:', err);
    });

    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
