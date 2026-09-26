import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { confirmReconciliation, dismissReconciliation, listReconciliations } from '@/services/reconciliation';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  action: z.enum(['confirm', 'dismiss']),
  ticketId: z.string().min(1),
});

// GET /api/campaigns/[id]/reconcile?status=  — JEWL's ledger of catches (Watcher only).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const status = request.nextUrl.searchParams.get('status') ?? undefined;
    const tickets = await listReconciliations(campaignId, { userId: session.user.id, role: session.user.role }, status);
    return NextResponse.json({ tickets });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST /api/campaigns/[id]/reconcile { action: 'confirm' | 'dismiss', ticketId }
//   confirm — "we're going somewhere new": hold the estimate, spin up stubs, move the beings.
//   dismiss — "that was a mistake": nothing was written.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const { action, ticketId } = bodySchema.parse(await request.json());
    const actor = { userId: session.user.id, username: session.user.username, role: session.user.role };
    const ticket = action === 'confirm'
      ? await confirmReconciliation(campaignId, actor, ticketId)
      : await dismissReconciliation(campaignId, actor, ticketId);
    return NextResponse.json({ ticket });
  } catch (error) {
    return errorResponse(error);
  }
}
