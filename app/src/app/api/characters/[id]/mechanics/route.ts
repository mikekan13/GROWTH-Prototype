import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { assignMechanics, assignMechanicsSchema } from '@/services/character';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = assignMechanicsSchema.parse(body);
    const updated = await assignMechanics(id, session.user.id, session.user.role, input);
    return NextResponse.json({
      character: { id: updated.id, name: updated.name, status: updated.status },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
