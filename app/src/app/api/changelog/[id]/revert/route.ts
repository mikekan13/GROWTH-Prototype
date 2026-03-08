import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { revertChangeLogEntry } from '@/services/changelog';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireAuth();
    const { id } = await params;

    const restoredData = await revertChangeLogEntry(id, user.id);

    return NextResponse.json({ success: true, data: restoredData });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Conflict')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return errorResponse(error);
  }
}
