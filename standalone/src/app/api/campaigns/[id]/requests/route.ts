import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listPlayerRequests, createPlayerRequest, createPlayerRequestSchema } from '@/services/forge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const sp = request.nextUrl.searchParams;

    const requests = await listPlayerRequests(campaignId, session.user.id, session.user.role, {
      status: sp.get('status') || undefined,
    });

    return NextResponse.json({ requests });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = createPlayerRequestSchema.parse(body);
    const result = await createPlayerRequest(campaignId, session.user.id, input);
    return NextResponse.json({ request: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
