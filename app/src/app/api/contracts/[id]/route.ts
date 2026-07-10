import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError } from '@/lib/errors';
import { canManageContracts } from '@/lib/permissions';
import {
  getContract,
  revokeContract,
  updateContract,
  updateContractSchema,
} from '@/services/contracts';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (!canManageContracts(session.user.role)) {
      throw new ForbiddenError('Contracts are ADMIN-only');
    }
    const { id } = await params;
    const contract = await getContract(id);
    return NextResponse.json({ contract });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (!canManageContracts(session.user.role)) {
      throw new ForbiddenError('Contracts are ADMIN-only');
    }
    const { id } = await params;
    const body = await request.json();
    const input = updateContractSchema.parse(body);
    const contract = await updateContract(id, input);
    return NextResponse.json({ contract });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    if (!canManageContracts(session.user.role)) {
      throw new ForbiddenError('Contracts are ADMIN-only');
    }
    const { id } = await params;
    const contract = await revokeContract(id);
    return NextResponse.json({ contract });
  } catch (error) {
    return errorResponse(error);
  }
}
