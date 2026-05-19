import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';
import { executeDeathSplit, previewDeathSplit } from '@/services/krma/death-split';

export const dynamic = 'force-dynamic';

// GET /api/characters/[id]/death — preview the death-split manifest.
// Pure read; nothing is written. GM-only.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const character = await prisma.character.findUnique({
      where: { id },
      include: { campaign: { select: { gmUserId: true } } },
    });
    if (!character) throw new NotFoundError('Character not found');
    if (!canEditCharacter(session.user.id, session.user.role, character)) {
      throw new ForbiddenError('Only the GM can preview the death split');
    }

    const preview = await previewDeathSplit(id, character.campaignId!);
    return NextResponse.json(preview);
  } catch (error) {
    return errorResponse(error);
  }
}

const ExecuteSchema = z.object({
  cause: z.string().min(1).max(500),
  sessionId: z.string().optional(),
});

// POST /api/characters/[id]/death — actually execute the death split.
// GM-only; idempotent at the ledger level (idempotencyKey is per batch).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = ExecuteSchema.parse(body);

    const character = await prisma.character.findUnique({
      where: { id },
      include: { campaign: { select: { gmUserId: true } } },
    });
    if (!character) throw new NotFoundError('Character not found');
    if (!canEditCharacter(session.user.id, session.user.role, character)) {
      throw new ForbiddenError('Only the GM can execute a death split');
    }

    const result = await executeDeathSplit(
      id,
      character.campaignId!,
      { cause: input.cause, sessionId: input.sessionId },
      session.user.id,
    );
    return NextResponse.json({
      transactions: result.transactions.map(t => ({
        id: t.id,
        amount: t.amount.toString(),
        reason: t.reason,
      })),
      manifest: result.manifest,
      spiritPackageKV: result.spiritPackageKV,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
