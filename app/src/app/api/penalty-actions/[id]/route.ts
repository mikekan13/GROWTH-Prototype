import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError } from '@/lib/errors';
import { canManageContracts } from '@/lib/permissions';
import { confirmPenaltyAction, rejectPenaltyAction } from '@/services/contracts';

const resolveSchema = z.object({ action: z.enum(['confirm', 'reject']) });

/** ADMIN confirms (executes) or rejects a pending penalty action. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (!canManageContracts(session.user.role)) {
      throw new ForbiddenError('Penalty confirmation is ADMIN-only');
    }
    const { id } = await params;
    const { action } = resolveSchema.parse(await request.json());
    const result =
      action === 'confirm'
        ? await confirmPenaltyAction(id, session.user.id)
        : await rejectPenaltyAction(id, session.user.id);
    return NextResponse.json({ penaltyAction: result });
  } catch (error) {
    return errorResponse(error);
  }
}
