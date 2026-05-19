import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import {
  previewBurn,
  executeBurn,
  burnPreviewSchema,
  burnExecuteSchema,
} from '@/services/burn';

export const dynamic = 'force-dynamic';

// POST /api/characters/[id]/burn?preview=1 — preview scaledCost
// POST /api/characters/[id]/burn                — execute the burn
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await request.json();
    const isPreview = request.nextUrl.searchParams.get('preview') === '1';

    if (isPreview) {
      const input = burnPreviewSchema.parse({ ...body, characterId: id });
      const preview = await previewBurn(session.user.id, session.user.role, input);
      return NextResponse.json(preview);
    }

    const input = burnExecuteSchema.parse({ ...body, characterId: id });
    const result = await executeBurn(session.user.id, session.user.role, input);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
