import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { expandResponse, expandResponseSchema } from '@/services/application';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = expandResponseSchema.parse(body);
    const result = await expandResponse(id, session.user.id, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
