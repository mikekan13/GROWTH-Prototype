import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';

// GET — player loads their own member data (including characterDesc)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: id, userId: session.user.id } },
    });
    if (!member) throw new NotFoundError('Not a member of this campaign');

    return NextResponse.json({ member });
  } catch (error) {
    return errorResponse(error);
  }
}

// PATCH — player saves their character description
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const { characterDesc } = await request.json();

    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: id, userId: session.user.id } },
    });
    if (!member) throw new NotFoundError('Not a member of this campaign');

    const updated = await prisma.campaignMember.update({
      where: { id: member.id },
      data: { characterDesc: JSON.stringify(characterDesc) },
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
