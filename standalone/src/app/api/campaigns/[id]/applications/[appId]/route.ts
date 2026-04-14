import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { reviewApplication, reviewApplicationSchema } from '@/services/application';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; appId: string }> },
) {
  try {
    const session = await requireAuth();
    const { appId } = await params;
    const body = await request.json();
    const input = reviewApplicationSchema.parse(body);
    const application = await reviewApplication(appId, session.user.id, session.user.role, input);
    return NextResponse.json({ application });
  } catch (error) {
    return errorResponse(error);
  }
}
