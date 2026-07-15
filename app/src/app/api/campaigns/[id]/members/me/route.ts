import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';

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

// PATCH — player saves their character description and/or submits their
// backstory for the Watcher's approval (T28).
//   body.characterDesc  → persist the draft (backstory + physical + portrait state)
//   body.submit === true → flag it submitted for GM approval (status must be BACKSTORY)
// Both may be present; the client saves the draft then submits in one call.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();

    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: id, userId: session.user.id } },
    });
    if (!member) throw new NotFoundError('Not a member of this campaign');

    const data: {
      characterDesc?: string;
      backstorySubmitted?: boolean;
      backstorySubmittedAt?: Date;
    } = {};

    if (body.characterDesc !== undefined) {
      data.characterDesc = JSON.stringify(body.characterDesc);
    }

    if (body.submit === true) {
      // The player does NOT self-advance; submitting only signals the GM
      // (ruling 2026-07-12). Guard: they must have been accepted into backstory.
      if (member.status !== 'BACKSTORY') {
        throw new ValidationError(
          'You can submit your backstory once your Watcher has accepted you into the campaign.',
        );
      }
      data.backstorySubmitted = true;
      data.backstorySubmittedAt = new Date();
    }

    const updated = await prisma.campaignMember.update({
      where: { id: member.id },
      data,
    });

    return NextResponse.json({ member: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
