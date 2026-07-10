import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { ForbiddenError } from '@/lib/errors';
import { canManageContracts } from '@/lib/permissions';
import {
  createContract,
  createContractSchema,
  listContracts,
} from '@/services/contracts';
import type { ContractStatus } from '@/types/contracts';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!canManageContracts(session.user.role)) {
      throw new ForbiddenError('Contracts are ADMIN-only');
    }
    const url = new URL(request.url);
    const campaignId = url.searchParams.get('campaignId') ?? undefined;
    const status = (url.searchParams.get('status') as ContractStatus | null) ?? undefined;
    const contracts = await listContracts({ campaignId, status });
    return NextResponse.json({ contracts });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();
    if (!canManageContracts(session.user.role)) {
      throw new ForbiddenError('Contracts are ADMIN-only');
    }
    const body = await request.json();
    const input = createContractSchema.parse(body);
    // Immutable contracts can NOT be created through the API — seed only.
    const contract = await createContract(input, session.user.id);
    return NextResponse.json({ contract }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
