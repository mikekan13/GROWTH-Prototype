import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { runWatcherTurn } from '@/ai/watcher/watcher-gm';

const bodySchema = z.object({ text: z.string().min(1).max(4000) });

// POST /api/campaigns/[id]/watcher-gm — one player turn to the AI GM
// (Incubator test instrument; see ai/watcher/watcher-gm.ts).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const { text } = bodySchema.parse(await request.json());
    const result = await runWatcherTurn({
      campaignId,
      userId: session.user.id,
      userRole: session.user.role,
      playerText: text,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

// GET — the play transcript.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id: campaignId } = await params;
    const events = await prisma.campaignEvent.findMany({
      where: { campaignId, type: 'watcher_gm' },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return NextResponse.json({
      turns: events.map(e => ({
        actor: e.actor,
        ...(JSON.parse(e.payload) as { text?: string }),
        at: e.createdAt,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
