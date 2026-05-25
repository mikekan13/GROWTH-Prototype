import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listGodheadsAdmin } from '@/services/godhead-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await requireAuth();
    const godheads = await listGodheadsAdmin(session.user.role);
    return NextResponse.json({ godheads });
  } catch (error) {
    return errorResponse(error);
  }
}
