import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError } from '@/lib/errors';
import { canManageContracts } from '@/lib/permissions';
import { evaluateContract } from '@/services/contracts';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (!canManageContracts(session.user.role)) {
      throw new ForbiddenError('Contracts are ADMIN-only');
    }
    const { id } = await params;
    const result = await evaluateContract(id, 'MANUAL');
    return NextResponse.json({ result });
  } catch (error) {
    return errorResponse(error);
  }
}
