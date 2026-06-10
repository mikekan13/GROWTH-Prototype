import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listTimescales, createTimescale, createTimescaleSchema } from '@/services/time';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
    const { id } = await params;
    return NextResponse.json(await listTimescales(id));
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
    const input = createTimescaleSchema.parse(await request.json());
    const created = await createTimescale(id, session.user.id, session.user.role, input);
    return NextResponse.json({ timescale: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
