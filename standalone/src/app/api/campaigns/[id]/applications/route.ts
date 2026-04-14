import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listApplications } from '@/services/application';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const applications = await listApplications(id, session.user.id, session.user.role);
    return NextResponse.json({ applications });
  } catch (error) {
    return errorResponse(error);
  }
}
