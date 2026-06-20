/**
 * Ambient audio chunk ingestion.
 *
 * Per [[jewl-always-on-audio-when-active]] JEWL listens continuously while
 * the GM is on a campaign page. The chip pushes a 10-second audio chunk
 * here every tick. We transcribe via the STT pipe, and — if the transcript
 * is non-empty — append it to the campaign's copilot history as a user
 * message tagged `[ambient]`. JEWL sees it the next time he reasons (via
 * an autonomous tick, an explicit prompt, or an observation event). We do
 * NOT call Claude per chunk; that would burn 6 round-trips/min for what is
 * almost always uneventful silence.
 *
 * Decoupling transcription from Claude reasoning is the cheap-and-right
 * shape: the heavy reasoning happens on a deliberate trigger, ambient
 * context piles up in the log between triggers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { transcribeAudio } from '@/ai/providers/stt';
import { maybeFireClassifier } from '@/ai/copilot/classifier';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;

    const body = (await request.json()) as { dataUrl?: string };
    const dataUrl = String(body.dataUrl ?? '');
    if (!dataUrl.startsWith('data:audio/')) {
      return NextResponse.json({ error: 'dataUrl must be a data:audio/... URL' }, { status: 400 });
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

    // Transcribe. The pipe handles "no provider configured" gracefully — it
    // returns a marker transcript; we log it once per session so the GM
    // sees the system is wired but the API key isn't set, instead of
    // wondering why JEWL stays silent.
    const stt = await transcribeAudio(dataUrl);
    const transcript = stt.transcript.trim();

    if (!transcript) {
      return NextResponse.json({ accepted: true, transcribed: false });
    }

    // If the provider is 'none' or unimplemented, the transcript is a
    // bracketed marker, not real speech. Log it ONCE per campaign so we
    // don't spam the chat log with the same warning every 10 seconds.
    const looksLikeMarker = transcript.startsWith('[') && transcript.endsWith(']');
    if (looksLikeMarker) {
      const sinceCutoff = new Date(Date.now() - 60 * 60 * 1000); // 1h
      const existingWarning = await prisma.copilotMessage.findFirst({
        where: {
          campaignId,
          role: 'user',
          username: '[ambient]',
          content: transcript,
          createdAt: { gte: sinceCutoff },
        },
        select: { id: true },
      });
      if (existingWarning) {
        return NextResponse.json({ accepted: true, transcribed: false, deduped: true });
      }
    }

    await prisma.copilotMessage.create({
      data: {
        campaignId,
        role: 'user',
        content: transcript,
        username: '[ambient]',
        userId: session.user.id,
        actions: JSON.stringify({
          source: 'TABLE_AMBIENT',
          sttProvider: stt.provider,
        }),
      },
    });

    // Per [[jewl-always-on-audio-when-active]] there is no wake word — JEWL
    // is supposed to decide moment-by-moment whether to react. We delegate
    // that decision to a cheap Haiku classifier (see classifier.ts). The
    // classifier verdict is AWAITED (~500ms Haiku call) so the chip can
    // show a "thinking" state immediately when JEWL wakes Sonnet. The
    // Sonnet dispatch (the slow part) is still fire-and-forget inside
    // maybeFireClassifier — the chip picks the reply up via the 5s poll.
    let classifierVerdict: string | undefined;
    if (!looksLikeMarker) {
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
        console.error('[audio-chunk] classifier failed:', err);
      }
    }

    return NextResponse.json({
      accepted: true,
      transcribed: true,
      provider: stt.provider,
      length: transcript.length,
      classifierVerdict,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
