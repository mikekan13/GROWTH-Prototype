import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listGlobalCatalog } from '@/services/forge';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || undefined;
    const search = searchParams.get('search') || undefined;
    const items = await listGlobalCatalog(type, search);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
