import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { submitBackstory, reviewBackstory, submitBackstorySchema, reviewBackstorySchema } from '@/services/backstory';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = submitBackstorySchema.parse(body);
    const backstory = await submitBackstory(id, session.user.id, input);
    return NextResponse.json({ backstory });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = reviewBackstorySchema.parse(body);
    const backstory = await reviewBackstory(id, session.user.id, session.user.role, input);
    return NextResponse.json({ backstory });
  } catch (error) {
    return errorResponse(error);
  }
}
