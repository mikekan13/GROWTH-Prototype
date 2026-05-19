import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { canManageCampaign, isAdminRole } from '@/lib/permissions';
import { NotFoundError, ForbiddenError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

// GET /api/campaigns/[id]/godhead-messages
// List GodHead↔GM message history for this campaign. GM/admin only.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
      throw new ForbiddenError();
    }
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(sp.get('limit') || '50'), 200);
    const direction = sp.get('direction'); // GODHEAD_TO_GM | GM_TO_GODHEAD | null=both
    const messages = await prisma.godHeadMessage.findMany({
      where: { campaignId, ...(direction ? { direction } : {}) },
      include: { godHead: { select: { name: true, pillar: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({
      messages: messages.map(m => ({
        id: m.id,
        godHeadId: m.godHeadId,
        godHeadName: m.godHead.name,
        godHeadPillar: m.godHead.pillar,
        direction: m.direction,
        content: m.content,
        invocationId: m.invocationId,
        readAt: m.readAt?.toISOString() ?? null,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

const PostSchema = z.object({
  godheadName: z.string().min(1),
  content: z.string().min(1).max(8000),
});

// POST /api/campaigns/[id]/godhead-messages
// GM sends a message to a specific godhead. Recorded as GM_TO_GODHEAD;
// the dispatcher may pick it up via a separate 'gm.request' event the
// caller is free to emit alongside.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(session.user.id, session.user.role, campaign) && !isAdminRole(session.user.role)) {
      throw new ForbiddenError();
    }
    const body = await request.json();
    const { godheadName, content } = PostSchema.parse(body);
    const godhead = await prisma.godHead.findUnique({ where: { name: godheadName } });
    if (!godhead) throw new NotFoundError('Godhead not found');
    const msg = await prisma.godHeadMessage.create({
      data: {
        godHeadId: godhead.id,
        campaignId,
        direction: 'GM_TO_GODHEAD',
        content,
      },
    });
    return NextResponse.json({ id: msg.id, createdAt: msg.createdAt.toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}

const PatchSchema = z.object({ messageId: z.string(), markRead: z.boolean().optional() });

// PATCH /api/campaigns/[id]/godhead-messages — mark a message as read by GM
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundError('Campaign not found');
    if (!canManageCampaign(session.user.id, session.user.role, campaign)) {
      throw new ForbiddenError();
    }
    const { messageId, markRead } = PatchSchema.parse(await request.json());
    if (markRead) {
      await prisma.godHeadMessage.update({
        where: { id: messageId },
        data: { readAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
