import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { crystallizeEntity } from '@/services/entity';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entityId: string }> },
) {
  try {
    const session = await requireAuth();
    const { entityId } = await params;
    const body = await request.json();
    const result = await crystallizeEntity(entityId, session.user.id, session.user.role, body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
