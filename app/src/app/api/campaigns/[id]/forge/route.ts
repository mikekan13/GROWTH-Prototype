import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listForgeItems, listGlobalCatalog } from '@/services/forge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const sp = request.nextUrl.searchParams;

    // Global catalog mode
    if (sp.get('global') === 'true') {
      const items = await listGlobalCatalog(
        sp.get('type') || undefined,
        sp.get('search') || undefined,
      );
      return NextResponse.json({ items });
    }

    const items = await listForgeItems(campaignId, session.user.id, session.user.role, {
      type: sp.get('type') || undefined,
      status: sp.get('status') || undefined,
    });

    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST removed by design — every blueprint must go through the authoring
// chain (Selva → Creator → Kai → Et'herling) so KV grading is enforced.
// Use POST /api/campaigns/[id]/forge/author to author, then PUT to confirm.
// Pulls from the global catalog use POST /api/campaigns/[id]/forge/pull.
export async function POST() {
  return NextResponse.json(
    {
      error: 'Direct blueprint creation is disabled. Submit via /forge/author so the chain can grade it.',
    },
    { status: 410 },
  );
}
