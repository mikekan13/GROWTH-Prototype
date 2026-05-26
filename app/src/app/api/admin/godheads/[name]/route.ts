import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getGodheadAdmin, updateGodheadAdmin } from '@/services/godhead-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const session = await requireAuth();
    const { name } = await params;
    const detail = await getGodheadAdmin(session.user.id, session.user.role, decodeURIComponent(name));
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  try {
    const session = await requireAuth();
    const { name } = await params;
    const body = await request.json();
    const result = await updateGodheadAdmin(session.user.id, session.user.role, decodeURIComponent(name), body);
    return NextResponse.json({ ok: true, godhead: { name: result.name, updatedAt: result.updatedAt } });
  } catch (error) {
    return errorResponse(error);
  }
}
