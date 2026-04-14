import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getApplication, saveApplication, saveApplicationSchema } from '@/services/application';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const application = await getApplication(id, session.user.id);
    return NextResponse.json({ application });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const input = saveApplicationSchema.parse(body);
    const application = await saveApplication(id, session.user.id, input);
    return NextResponse.json({ application });
  } catch (error) {
    return errorResponse(error);
  }
}
