import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { createNovelWorld, listNovelWorldsFor } from '@/services/novel-worlds';

export const dynamic = 'force-dynamic';

// GET /api/characters/[id]/novel-worlds — her novels that are doorways to world campaigns.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const worlds = await listNovelWorldsFor({ id: session.user.id, role: session.user.role }, id);
    return NextResponse.json({ worlds });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/characters/[id]/novel-worlds {title, shelfLocation?} — Watcher/ADMIN:
// open a world (session-0 campaign) for one of her novels; the book is its doorway.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createNovelWorld(
      { id: session.user.id, role: session.user.role },
      { title: body.title, shelfLocation: body.shelfLocation, authorCharacterId: id },
    );
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
