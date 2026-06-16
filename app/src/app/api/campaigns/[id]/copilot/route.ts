import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { dispatchPrompt } from '@/ai/copilot/runtime';
import { prisma } from '@/lib/db';
import type { JewlPrompt, CanvasActionPayload, JewlPromptSource, JewlMedia } from '@/ai/copilot/prompts/types';

/**
 * JEWL prompt entry point. Accepts either:
 *   { message: string }                            — legacy text chat
 *   { prompt: { source, text, canvasAction?, media? } } — canvas / voice / etc.
 *
 * Both shapes converge into a `JewlPrompt` and route through `dispatchPrompt`,
 * which calls Claude with tools, executes any tool calls, and writes the
 * (prompt, thought, tool_call, result) triple to the campaign log.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const body = await request.json() as {
      message?: string;
      prompt?: {
        source?: JewlPromptSource;
        text?: string;
        canvasAction?: CanvasActionPayload;
        media?: JewlMedia[];
      };
    };

    // Verify access: must be GM or campaign member.
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

    let jewlPrompt: JewlPrompt;
    if (body.prompt) {
      const source: JewlPromptSource = body.prompt.source ?? 'GM_TEXT';
      const text = String(body.prompt.text ?? '').trim();
      if (!text && !body.prompt.canvasAction) {
        return NextResponse.json(
          { error: 'Prompt must include text or canvasAction' },
          { status: 400 },
        );
      }
      if (text.length > 4000) {
        return NextResponse.json({ error: 'Prompt text too long (max 4000)' }, { status: 400 });
      }
      jewlPrompt = {
        source,
        campaignId: id,
        actorId: session.user.id,
        actorName: session.user.username,
        actorRole: session.user.role,
        text,
        canvasAction: body.prompt.canvasAction,
        media: body.prompt.media,
      };
    } else {
      const text = String(body.message ?? '').trim();
      if (!text) {
        return NextResponse.json({ error: 'Message required' }, { status: 400 });
      }
      if (text.length > 2000) {
        return NextResponse.json({ error: 'Message too long (max 2000 chars)' }, { status: 400 });
      }
      jewlPrompt = {
        source: 'GM_TEXT',
        campaignId: id,
        actorId: session.user.id,
        actorName: session.user.username,
        actorRole: session.user.role,
        text,
      };
    }

    const response = await dispatchPrompt(jewlPrompt);
    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
