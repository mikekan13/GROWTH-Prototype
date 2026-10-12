/**
 * POST /api/campaigns/[id]/genesis/prods/[prodId]/decide
 * { decision: 'ANSWER' | 'LEAVE_OPEN' | 'YOU_DECIDE', answer? } — the GM
 * decides one of JEWL's prods. Campaign GM / ADMIN only. Thin wrapper over
 * services/genesis-prods.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { decideProd } from '@/services/genesis-prods';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; prodId: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, prodId } = await params;
    const body = await request.json().catch(() => ({}));
    const result = await decideProd({ campaignId: id, prodId, user: session.user, body });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
