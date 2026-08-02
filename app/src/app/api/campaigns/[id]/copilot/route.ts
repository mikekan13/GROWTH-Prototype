import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { dispatchPrompt } from '@/ai/copilot/runtime';
import { prisma } from '@/lib/db';
import type { JewlPrompt, CanvasActionPayload, JewlPromptSource, JewlMedia } from '@/ai/copilot/prompts/types';

/**
 * JEWL prompt entry point. Single shape:
 *   { prompt: { source, text, canvasAction?, media? } }
 *
 * Routes through `dispatchPrompt`, which calls Claude with tools, executes any
 * tool calls, and writes the (prompt, thought, tool_call, result) triple to
 * the campaign log. Source-pluggable from day one
 * ([[jewl-full-vision-2026-06-14]]).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const body = await request.json() as {
      prompt?: {
        source?: JewlPromptSource;
        text?: string;
        canvasAction?: CanvasActionPayload;
        media?: JewlMedia[];
      };
    };

    if (!body.prompt) {
      return NextResponse.json(
        { error: 'Request must include a `prompt` envelope' },
        { status: 400 },
      );
    }

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

    const source: JewlPromptSource = body.prompt.source ?? 'GM_TEXT';
    const text = String(body.prompt.text ?? '').trim();
    if (!text && !body.prompt.canvasAction) {
      return NextResponse.json(
        { error: 'Prompt must include text or canvasAction' },
        { status: 400 },
      );
    }
    // Budgeted against the SMALLEST model in the finished route-by-job
    // chain: the local pod core at 32k-token context (~128k chars) minus
    // system prompt + context blocks + response headroom. 32k chars ≈ 8k
    // tokens fits everything comfortably (a full environment-design spec
    // is ~9k chars). Claude tiers (200k tokens) are never the binding
    // constraint; the classifier truncates per-line and doesn't care.
    const maxChars = Number(process.env.JEWL_PROMPT_MAX_CHARS ?? 32_000);
    if (text.length > maxChars) {
      return NextResponse.json(
        { error: `Prompt text too long (max ${maxChars} characters)` },
        { status: 400 },
      );
    }

    const jewlPrompt: JewlPrompt = {
      source,
      campaignId: id,
      actorId: session.user.id,
      actorName: session.user.username,
      actorRole: session.user.role,
      text,
      canvasAction: body.prompt.canvasAction,
      media: body.prompt.media,
    };

    const response = await dispatchPrompt(jewlPrompt);
    return NextResponse.json(response);
  } catch (error) {
    return errorResponse(error);
  }
}
